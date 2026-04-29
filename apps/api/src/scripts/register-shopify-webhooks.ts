/**
 * Registers required Shopify webhooks for the configured store.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/register-shopify-webhooks.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '../../.env') });

const shop = process.env.SHOPIFY_SHOP;
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const apiVersion = process.env.SHOPIFY_API_VERSION ?? '2025-10';
const callbackUrl =
  process.env.SHOPIFY_WEBHOOK_CALLBACK_URL ??
  (process.env.SHOPIFY_APP_URL ? `${process.env.SHOPIFY_APP_URL}/api/shopify/webhooks` : undefined);

const topics = ['PRODUCTS_UPDATE', 'PRODUCTS_DELETE', 'INVENTORY_LEVELS_UPDATE'] as const;

type WebhookTopic = (typeof topics)[number];

type ExistingWebhook = {
  id: string;
  topic: WebhookTopic;
  endpoint?: {
    __typename: string;
    callbackUrl?: string;
  };
};

if (!shop || !accessToken || !callbackUrl) {
  console.error(
    'Missing required env vars: SHOPIFY_SHOP, SHOPIFY_ACCESS_TOKEN, and SHOPIFY_WEBHOOK_CALLBACK_URL or SHOPIFY_APP_URL',
  );
  process.exit(1);
}

if (!callbackUrl.startsWith('https://')) {
  console.warn(
    `Warning: Shopify generally requires a public HTTPS webhook callback URL. Current callback: ${callbackUrl}`,
  );
}

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(`https://${shop}/admin/api/${apiVersion}/graphql.json`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Shopify-Access-Token': accessToken!,
    },
    body: JSON.stringify({ query, variables }),
  });

  const data = (await response.json()) as T & { errors?: Array<{ message: string }> | string };
  if (!response.ok || data.errors) {
    const message = Array.isArray(data.errors)
      ? data.errors.map((error) => error.message).join('; ')
      : data.errors || response.statusText;
    throw new Error(`Shopify GraphQL error (${response.status}): ${message}`);
  }

  return data;
}

async function listExistingWebhooks(): Promise<ExistingWebhook[]> {
  const data = await graphql<{
    data?: {
      webhookSubscriptions: {
        edges: Array<{
          node: ExistingWebhook;
        }>;
      };
    };
  }>(`
    query ExistingWebhooks {
      webhookSubscriptions(first: 100) {
        edges {
          node {
            id
            topic
            endpoint {
              __typename
              ... on WebhookHttpEndpoint {
                callbackUrl
              }
            }
          }
        }
      }
    }
  `);

  return data.data?.webhookSubscriptions.edges.map((edge) => edge.node) ?? [];
}

async function createWebhook(topic: WebhookTopic): Promise<void> {
  const data = await graphql<{
    data?: {
      webhookSubscriptionCreate: {
        webhookSubscription?: {
          id: string;
          topic: WebhookTopic;
        };
        userErrors: Array<{
          field?: string[];
          message: string;
        }>;
      };
    };
  }>(
    `
      mutation CreateWebhook($topic: WebhookSubscriptionTopic!, $callbackUrl: URL!) {
        webhookSubscriptionCreate(
          topic: $topic
          webhookSubscription: {
            callbackUrl: $callbackUrl
            format: JSON
          }
        ) {
          webhookSubscription { id topic }
          userErrors { field message }
        }
      }
    `,
    { topic, callbackUrl },
  );

  const result = data.data?.webhookSubscriptionCreate;
  if (!result) {
    throw new Error(`Shopify did not return webhookSubscriptionCreate for ${topic}`);
  }

  if (result.userErrors.length > 0) {
    throw new Error(
      `Could not register ${topic}: ${result.userErrors
        .map((error) => error.message)
        .join('; ')}`,
    );
  }

  console.log(`Registered ${topic}`);
}

async function main() {
  console.log(`Registering Shopify webhooks for shop=${shop}`);
  console.log(`Callback URL: ${callbackUrl}`);

  const existing = await listExistingWebhooks();
  for (const topic of topics) {
    const alreadyRegistered = existing.some(
      (webhook) => webhook.topic === topic && webhook.endpoint?.callbackUrl === callbackUrl,
    );

    if (alreadyRegistered) {
      console.log(`Already registered ${topic}`);
      continue;
    }

    await createWebhook(topic);
  }

  console.log('Done.');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
