/**
 * Publishes or drafts a Shopify blog article.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/publish-shopify-article.ts \
 *     --title "Article title" \
 *     --body-file ../../content/article.html \
 *     --handle custom-slug \
 *     --tags "SEO,Shopify" \
 *     --image-file ../../assets/article-hero.jpg \
 *     --image-alt "Article hero image"
 */
import { config } from 'dotenv';
import { basename, extname, resolve } from 'node:path';
import { readFile, stat } from 'node:fs/promises';

config({ path: resolve(process.cwd(), '../../.env') });

type Args = Record<string, string | boolean | undefined>;

type ShopifyUserError = {
  field?: string[];
  message: string;
};

type ShopifyGraphqlResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }> | string;
};

type BlogNode = {
  id: string;
  title: string;
  handle: string;
};

type ShopifyFileNode = {
  __typename: string;
  id: string;
  fileStatus: string;
  image?: { url?: string };
};

const shop = process.env.SHOPIFY_SHOP;
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN ?? process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2026-04';

const usage = `
Usage:
  npx tsx src/scripts/publish-shopify-article.ts --title "Title" --body-file ./article.html [options]

Required:
  --title <text>
  --body-file <path>          HTML body file
    or --body-html <html>     Inline HTML body

Article options:
  --blog-id <gid-or-number>   Defaults to the first blog in the shop
  --blog-handle <handle>      Finds the blog by handle
  --author <name>             Defaults to "Sunday Stripe"
  --handle <slug>             Custom article slug
  --summary-file <path>       HTML summary/excerpt file
  --summary-html <html>       Inline HTML summary/excerpt
  --tags <a,b,c>              Comma-separated tags
  --template-suffix <suffix>  Alternate article template suffix
  --seo-title <text>          Stores global.title_tag metafield
  --seo-description <text>    Stores global.description_tag metafield

Publish options:
  --draft                     Create unpublished article
  --publish-at <iso-date>     Schedule/publish at an ISO 8601 date

Image options:
  --image-url <url>           Use an existing public image URL as article image
  --image-file <path>         Upload a local image to Shopify Files, then use it
  --image-alt <text>          Alt text for article/File image
  --article-image-attachment  Attach --image-file directly to the article instead of Shopify Files
  --host-image-url            Copy --image-url into Shopify Files before using it

Safety:
  --dry-run                   Print the payload without publishing
`;

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--') {
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected positional argument: ${token}`);
    }

    const [rawKey, inlineValue] = token.slice(2).split(/=(.*)/s, 2);
    if (!rawKey) {
      throw new Error(`Invalid argument: ${token}`);
    }

    if (inlineValue !== undefined) {
      args[rawKey] = inlineValue;
      continue;
    }

    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[rawKey] = true;
      continue;
    }

    args[rawKey] = next;
    index += 1;
  }
  return args;
}

function getString(args: Args, key: string): string | undefined {
  const value = args[key];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function hasFlag(args: Args, key: string): boolean {
  return args[key] === true;
}

function numericIdToGid(kind: string, id: string): string {
  return id.startsWith('gid://') ? id : `gid://shopify/${kind}/${id}`;
}

function splitTags(tags: string | undefined): string[] | undefined {
  if (!tags) {
    return undefined;
  }

  const parsed = tags
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return parsed.length > 0 ? parsed : undefined;
}

function inferMimeType(path: string): string {
  const extension = extname(path).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
  };

  const mimeType = mimeTypes[extension];
  if (!mimeType) {
    throw new Error(`Unsupported image extension "${extension}". Use AVIF, GIF, JPEG, PNG, or WebP.`);
  }
  return mimeType;
}

async function readTextOption(args: Args, inlineKey: string, fileKey: string): Promise<string | undefined> {
  const inline = getString(args, inlineKey);
  const file = getString(args, fileKey);
  if (inline && file) {
    throw new Error(`Use either --${inlineKey} or --${fileKey}, not both.`);
  }
  if (inline) {
    return inline;
  }
  if (file) {
    return readFile(resolve(process.cwd(), file), 'utf8');
  }
  return undefined;
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  if (!shop || !accessToken) {
    throw new Error('Missing required env vars: SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN.');
  }

  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ query, variables }),
  });

  const body = (await response.json()) as ShopifyGraphqlResponse<T>;
  if (!response.ok || body.errors || !body.data) {
    const message = Array.isArray(body.errors)
      ? body.errors.map((error) => error.message).join('; ')
      : body.errors || JSON.stringify(body);
    throw new Error(`Shopify GraphQL error (${response.status}): ${message}`);
  }

  return body.data;
}

function throwOnUserErrors(label: string, errors: ShopifyUserError[]): void {
  if (errors.length === 0) {
    return;
  }

  throw new Error(
    `${label}: ${errors
      .map((error) => `${error.field?.join('.') ?? 'request'} ${error.message}`)
      .join('; ')}`,
  );
}

async function resolveBlog(args: Args): Promise<BlogNode> {
  const blogId = getString(args, 'blog-id');
  if (blogId) {
    const id = numericIdToGid('Blog', blogId);
    const data = await graphql<{
      node?: BlogNode & { __typename: string };
    }>(
      `
        query BlogById($id: ID!) {
          node(id: $id) {
            __typename
            ... on Blog { id title handle }
          }
        }
      `,
      { id },
    );

    if (data.node?.__typename === 'Blog') {
      return data.node;
    }
    throw new Error(`No Shopify blog found for ${blogId}`);
  }

  const data = await graphql<{
    blogs: {
      nodes: BlogNode[];
    };
  }>(`
    query Blogs {
      blogs(first: 50) {
        nodes { id title handle }
      }
    }
  `);

  const blogHandle = getString(args, 'blog-handle');
  if (blogHandle) {
    const match = data.blogs.nodes.find((blog) => blog.handle === blogHandle);
    if (!match) {
      throw new Error(`No Shopify blog found with handle "${blogHandle}".`);
    }
    return match;
  }

  const first = data.blogs.nodes[0];
  if (!first) {
    throw new Error('No Shopify blogs found for this shop.');
  }
  return first;
}

async function uploadLocalImageToShopify(path: string, altText: string | undefined): Promise<string> {
  const absolutePath = resolve(process.cwd(), path);
  const fileName = basename(absolutePath);
  const mimeType = inferMimeType(absolutePath);
  const fileStats = await stat(absolutePath);
  const fileBuffer = await readFile(absolutePath);

  const staged = await graphql<{
    stagedUploadsCreate: {
      stagedTargets: Array<{
        url: string;
        resourceUrl: string;
        parameters: Array<{ name: string; value: string }>;
      }>;
      userErrors: ShopifyUserError[];
    };
  }>(
    `
      mutation StagedUpload($input: [StagedUploadInput!]!) {
        stagedUploadsCreate(input: $input) {
          stagedTargets {
            url
            resourceUrl
            parameters { name value }
          }
          userErrors { field message }
        }
      }
    `,
    {
      input: [
        {
          filename: fileName,
          httpMethod: 'POST',
          mimeType,
          resource: 'IMAGE',
          fileSize: String(fileStats.size),
        },
      ],
    },
  );

  throwOnUserErrors('Could not create staged upload', staged.stagedUploadsCreate.userErrors);

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) {
    throw new Error('Shopify did not return a staged upload target.');
  }

  const form = new FormData();
  for (const parameter of target.parameters) {
    form.append(parameter.name, parameter.value);
  }
  form.append('file', new Blob([fileBuffer], { type: mimeType }), fileName);

  const upload = await fetch(target.url, {
    method: 'POST',
    body: form,
  });
  if (!upload.ok) {
    throw new Error(`Could not upload image to staged Shopify URL (${upload.status}): ${await upload.text()}`);
  }

  return createShopifyFile(target.resourceUrl, fileName, altText);
}

async function createShopifyFile(originalSource: string, fileName: string | undefined, altText: string | undefined): Promise<string> {
  const created = await graphql<{
    fileCreate: {
      files?: ShopifyFileNode[];
      userErrors: ShopifyUserError[];
    };
  }>(
    `
      mutation CreateFile($files: [FileCreateInput!]!) {
        fileCreate(files: $files) {
          files {
            __typename
            id
            fileStatus
            ... on MediaImage {
              image { url }
            }
          }
          userErrors { field message }
        }
      }
    `,
    {
      files: [
        {
          alt: altText,
          contentType: 'IMAGE',
          duplicateResolutionMode: 'APPEND_UUID',
          filename: fileName,
          originalSource,
        },
      ],
    },
  );

  throwOnUserErrors('Could not create Shopify File', created.fileCreate.userErrors);

  const file = created.fileCreate.files?.[0];
  if (!file) {
    throw new Error('Shopify did not return a created file.');
  }

  if (file.__typename === 'MediaImage' && file.image?.url) {
    return file.image.url;
  }

  return waitForMediaImageUrl(file.id);
}

async function waitForMediaImageUrl(fileId: string): Promise<string> {
  for (let attempt = 1; attempt <= 12; attempt += 1) {
    const data = await graphql<{
      node?: {
        __typename: string;
        fileStatus?: string;
        image?: { url?: string };
      };
    }>(
      `
        query FileUrl($id: ID!) {
          node(id: $id) {
            __typename
            ... on MediaImage {
              fileStatus
              image { url }
            }
          }
        }
      `,
      { id: fileId },
    );

    if (data.node?.__typename === 'MediaImage' && data.node.image?.url) {
      return data.node.image.url;
    }

    if (data.node?.fileStatus === 'FAILED') {
      throw new Error(`Shopify failed to process uploaded image ${fileId}.`);
    }

    await new Promise((resolveDelay) => setTimeout(resolveDelay, attempt * 1000));
  }

  throw new Error(`Shopify File ${fileId} is still processing. Try again in a moment.`);
}

async function resolveArticleImage(args: Args): Promise<{ url: string; altText?: string } | undefined> {
  const imageUrl = getString(args, 'image-url');
  const imageFile = getString(args, 'image-file');
  const imageAlt = getString(args, 'image-alt');
  const dryRun = hasFlag(args, 'dry-run');

  if (imageUrl && imageFile) {
    throw new Error('Use either --image-url or --image-file, not both.');
  }
  if (imageFile) {
    if (dryRun) {
      return { url: `shopify-file://would-upload/${basename(imageFile)}`, altText: imageAlt };
    }
    const hostedUrl = await uploadLocalImageToShopify(imageFile, imageAlt);
    return { url: hostedUrl, altText: imageAlt };
  }
  if (imageUrl && hasFlag(args, 'host-image-url')) {
    if (dryRun) {
      return { url: `shopify-file://would-copy/${imageUrl}`, altText: imageAlt };
    }
    const hostedUrl = await createShopifyFile(imageUrl, undefined, imageAlt);
    return { url: hostedUrl, altText: imageAlt };
  }
  if (imageUrl) {
    return { url: imageUrl, altText: imageAlt };
  }
  if (imageAlt) {
    throw new Error('--image-alt requires --image-url or --image-file.');
  }
  return undefined;
}

function toRestArticleInput(article: Record<string, unknown>): Record<string, unknown> {
  const restArticle: Record<string, unknown> = {
    author: (article.author as { name?: string } | undefined)?.name,
    body_html: article.body,
    handle: article.handle,
    published: article.isPublished,
    published_at: article.publishDate,
    summary_html: article.summary,
    tags: Array.isArray(article.tags) ? article.tags.join(', ') : undefined,
    template_suffix: article.templateSuffix,
    title: article.title,
  };

  const image = article.image as { url?: string; altText?: string; attachment?: string } | undefined;
  if (image?.attachment) {
    restArticle.image = { attachment: image.attachment, alt: image.altText };
  } else if (image?.url) {
    restArticle.image = { src: image.url, alt: image.altText };
  }

  const metafields = article.metafields;
  if (Array.isArray(metafields) && metafields.length > 0) {
    restArticle.metafields = metafields;
  }

  return Object.fromEntries(Object.entries(restArticle).filter(([, value]) => value !== undefined));
}

async function createArticleWithRest(blog: BlogNode, article: Record<string, unknown>): Promise<void> {
  if (!shop || !accessToken) {
    throw new Error('Missing required env vars: SHOPIFY_SHOP and SHOPIFY_ACCESS_TOKEN.');
  }

  const legacyBlogId = blog.id.split('/').at(-1);
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/blogs/${legacyBlogId}/articles.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken,
    },
    body: JSON.stringify({ article: toRestArticleInput(article) }),
  });

  const body = (await response.json()) as {
    article?: {
      id: number;
      title: string;
      handle: string;
      published: boolean;
      published_at?: string | null;
    };
    errors?: unknown;
  };

  if (!response.ok || body.errors || !body.article) {
    throw new Error(`Shopify REST article create failed (${response.status}): ${JSON.stringify(body.errors ?? body)}`);
  }

  console.log(`Created article: ${body.article.title}`);
  console.log(`ID: ${body.article.id}`);
  console.log(`Published: ${body.article.published}${body.article.published_at ? ` at ${body.article.published_at}` : ''}`);
  console.log(`URL: https://${shop}/blogs/${blog.handle}/${body.article.handle}`);
}

async function createArticle(args: Args): Promise<void> {
  const title = getString(args, 'title');
  const body = await readTextOption(args, 'body-html', 'body-file');
  if (!title || !body) {
    console.error(usage.trim());
    throw new Error('Missing required --title and --body-file/--body-html.');
  }

  const blog = await resolveBlog(args);
  const imageFile = getString(args, 'image-file');
  const articleImage = hasFlag(args, 'article-image-attachment') && imageFile
    ? {
        attachment: (await readFile(resolve(process.cwd(), imageFile))).toString('base64'),
        altText: getString(args, 'image-alt'),
      }
    : await resolveArticleImage(args);
  const publishDate = getString(args, 'publish-at');
  const seoTitle = getString(args, 'seo-title');
  const seoDescription = getString(args, 'seo-description');
  const metafields = [
    seoTitle
      ? { namespace: 'global', key: 'title_tag', type: 'single_line_text_field', value: seoTitle }
      : undefined,
    seoDescription
      ? { namespace: 'global', key: 'description_tag', type: 'single_line_text_field', value: seoDescription }
      : undefined,
  ].filter(Boolean);

  const article = {
    author: { name: getString(args, 'author') ?? 'Sunday Stripe' },
    blogId: blog.id,
    body,
    handle: getString(args, 'handle'),
    image: articleImage,
    isPublished: hasFlag(args, 'draft') ? false : true,
    metafields: metafields.length > 0 ? metafields : undefined,
    publishDate,
    summary: await readTextOption(args, 'summary-html', 'summary-file'),
    tags: splitTags(getString(args, 'tags')),
    templateSuffix: getString(args, 'template-suffix'),
    title,
  };

  if (hasFlag(args, 'dry-run')) {
    console.log(JSON.stringify({ shop, apiVersion, blog, article }, null, 2));
    return;
  }

  if (hasFlag(args, 'article-image-attachment')) {
    await createArticleWithRest(blog, article);
    return;
  }

  const data = await graphql<{
    articleCreate: {
      article?: {
        id: string;
        title: string;
        handle: string;
        isPublished: boolean;
        publishedAt?: string | null;
        blog: { handle: string };
      };
      userErrors: ShopifyUserError[];
    };
  }>(
    `
      mutation CreateArticle($article: ArticleCreateInput!) {
        articleCreate(article: $article) {
          article {
            id
            title
            handle
            isPublished
            publishedAt
            blog { handle }
          }
          userErrors { field message }
        }
      }
    `,
    { article },
  );

  throwOnUserErrors('Could not create article', data.articleCreate.userErrors);

  const created = data.articleCreate.article;
  if (!created) {
    throw new Error('Shopify did not return the created article.');
  }

  console.log(`Created article: ${created.title}`);
  console.log(`ID: ${created.id}`);
  console.log(`Published: ${created.isPublished}${created.publishedAt ? ` at ${created.publishedAt}` : ''}`);
  console.log(`URL: https://${shop}/blogs/${created.blog.handle}/${created.handle}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (hasFlag(args, 'help')) {
    console.log(usage.trim());
    return;
  }
  await createArticle(args);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
