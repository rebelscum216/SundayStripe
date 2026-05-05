import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

type AmazonTokenResponse = {
  access_token: string;
  expires_in: number;
};

type AmazonAttributeValue = { value?: string; media_location?: string };

export type AmazonListingAttributes = {
  item_name?: AmazonAttributeValue[];
  bullet_point?: AmazonAttributeValue[];
  product_description?: AmazonAttributeValue[];
  main_product_image_locator?: AmazonAttributeValue[];
  other_product_image_locator_1?: AmazonAttributeValue[];
  other_product_image_locator_2?: AmazonAttributeValue[];
  other_product_image_locator_3?: AmazonAttributeValue[];
  other_product_image_locator_4?: AmazonAttributeValue[];
  other_product_image_locator_5?: AmazonAttributeValue[];
  other_product_image_locator_6?: AmazonAttributeValue[];
  other_product_image_locator_7?: AmazonAttributeValue[];
  other_product_image_locator_8?: AmazonAttributeValue[];
};

type AmazonListingItem = {
  sku?: string;
  sellerSku?: string;
  asin?: string;
  summaries?: Array<{
    asin?: string;
    status?: string | string[];
    itemName?: string;
    productType?: string;
    mainImage?: {
      link?: string;
    };
  }>;
  attributes?: AmazonListingAttributes;
  issues?: unknown[];
};

type AmazonListingsResponse = {
  items?: AmazonListingItem[];
  pagination?: {
    nextToken?: string;
  };
  nextToken?: string;
};

export type AmazonListing = {
  sku: string;
  asin: string | null;
  status: string;
  title: string | null;
  productType: string | null;
  imageUrl: string | null;
  issues: unknown[];
  qualityScore: number; // enriched after SKU match via getListingAttributes()
};

const AMAZON_AUTH_URL = 'https://api.amazon.com/auth/o2/token';
const AMAZON_SP_API_BASE_URL = 'https://sellingpartnerapi-na.amazon.com';

@Injectable()
export class AmazonApiService {
  private accessToken: string | null = null;
  private accessTokenExpiresAt = 0;

  constructor(private readonly config: ConfigService) {}

  async fetchListingsPage(pageToken?: string): Promise<{ items: AmazonListing[]; nextToken?: string }> {
    const sellerId = this.config.getOrThrow<string>('AMAZON_SELLER_ID');
    const marketplaceId = this.config.getOrThrow<string>('AMAZON_MARKETPLACE_ID');

    const params = new URLSearchParams({
      marketplaceIds: marketplaceId,
      includedData: 'summaries', // issues fetched per-SKU to keep page payload small
    });
    if (pageToken) params.set('pageToken', pageToken);

    const data = await this.get<AmazonListingsResponse>(
      `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}?${params.toString()}`,
    );

    return {
      items: (data.items ?? []).map((item) => this.toListing(item)),
      nextToken: data.pagination?.nextToken ?? data.nextToken,
    };
  }

  async getListingDetail(sku: string): Promise<{ attributes?: AmazonListingAttributes; issues?: unknown[] }> {
    const sellerId = this.config.getOrThrow<string>('AMAZON_SELLER_ID');
    const marketplaceId = this.config.getOrThrow<string>('AMAZON_MARKETPLACE_ID');
    const params = new URLSearchParams({ marketplaceIds: marketplaceId, includedData: 'attributes,issues' });
    try {
      const data = await this.get<{ attributes?: AmazonListingAttributes; issues?: unknown[] }>(
        `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(sku)}?${params.toString()}`,
      );
      return { attributes: data.attributes, issues: data.issues };
    } catch {
      return {};
    }
  }

  private async get<T>(path: string, attempt = 1): Promise<T> {
    const accessToken = await this.getAccessToken();
    const signal = AbortSignal.timeout(120_000);
    let response: Response;
    try {
      response = await fetch(`${AMAZON_SP_API_BASE_URL}${path}`, {
        method: 'GET',
        headers: {
          'x-amz-access-token': accessToken,
          'Content-Type': 'application/json',
        },
        signal,
      });
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      const isTransient =
        cause.includes('timeout') ||
        cause.toLowerCase().includes('fetch failed') ||
        cause.includes('ECONNRESET') ||
        cause.includes('ENOTFOUND') ||
        cause.includes('ECONNREFUSED');
      if (attempt === 1 && isTransient) {
        await new Promise((r) => setTimeout(r, 10_000));
        return this.get<T>(path, 2);
      }
      throw new Error(`Amazon SP-API fetch error (${path}): ${cause}`);
    }

    if (response.status === 429) {
      if (attempt === 1) {
        await new Promise((r) => setTimeout(r, 10_000));
        return this.get<T>(path, 2);
      }
      throw new Error(`Amazon SP-API rate limited request: ${path}`);
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Amazon SP-API error ${response.status}: ${text}`);
    }

    return (await response.json()) as T;
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.accessToken && now < this.accessTokenExpiresAt - 60_000) {
      return this.accessToken;
    }

    const response = await fetch(AMAZON_AUTH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.getOrThrow<string>('AMAZON_CLIENT_ID'),
        client_secret: this.config.getOrThrow<string>('AMAZON_CLIENT_SECRET'),
        refresh_token: this.config.getOrThrow<string>('AMAZON_REFRESH_TOKEN'),
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Amazon LWA token error ${response.status}: ${text}`);
    }

    const data = (await response.json()) as AmazonTokenResponse;
    this.accessToken = data.access_token;
    this.accessTokenExpiresAt = now + data.expires_in * 1000;
    return this.accessToken;
  }

  private toListing(item: AmazonListingItem): AmazonListing {
    const statuses = this.getStatuses(item);
    const summary = item.summaries?.[0];
    return {
      sku: item.sku ?? item.sellerSku ?? '',
      asin: item.asin ?? item.summaries?.find((summary) => summary.asin)?.asin ?? null,
      status: statuses[0] ?? 'UNKNOWN',
      title: summary?.itemName ?? null,
      productType: summary?.productType ?? null,
      imageUrl: summary?.mainImage?.link ?? null,
      issues: item.issues ?? [],
      qualityScore: this.computeQualityScore(item.attributes),
    };
  }

  private getStatuses(item: AmazonListingItem): string[] {
    return (item.summaries ?? []).flatMap((summary) => {
      if (Array.isArray(summary.status)) return summary.status;
      return summary.status ? [summary.status] : [];
    });
  }

  /**
   * 0-100 score based on title, bullets, description, and image completeness.
   *
   * Title:       0-30 pts  (presence +10, ≥40 chars +10, ≥80 chars +10)
   * Bullets:     0-25 pts  (1+ bullets +10, 3+ bullets +8, 5+ bullets +7)
   * Description: 0-20 pts  (present +10, ≥100 chars +10)
   * Images:      0-25 pts  (main image +10, 3+ images +8, 7+ images +7)
   */
  computeQualityScore(attrs: AmazonListingAttributes | undefined): number {
    if (!attrs) return 0;

    let score = 0;

    // Title (0-30)
    const title = attrs.item_name?.[0]?.value ?? '';
    if (title.length > 0) score += 10;
    if (title.length >= 40) score += 10;
    if (title.length >= 80) score += 10;

    // Bullets (0-25)
    const bulletCount = (attrs.bullet_point ?? []).filter((b) => (b.value ?? '').trim().length > 0).length;
    if (bulletCount >= 1) score += 10;
    if (bulletCount >= 3) score += 8;
    if (bulletCount >= 5) score += 7;

    // Description (0-20)
    const description = attrs.product_description?.[0]?.value ?? '';
    if (description.length > 0) score += 10;
    if (description.length >= 100) score += 10;

    // Images (0-25)
    const imageFields: (keyof AmazonListingAttributes)[] = [
      'main_product_image_locator',
      'other_product_image_locator_1',
      'other_product_image_locator_2',
      'other_product_image_locator_3',
      'other_product_image_locator_4',
      'other_product_image_locator_5',
      'other_product_image_locator_6',
      'other_product_image_locator_7',
      'other_product_image_locator_8',
    ];
    const imageCount = imageFields.filter((field) => {
      const arr = attrs[field];
      return Array.isArray(arr) && arr.length > 0 && (arr[0].media_location ?? '').length > 0;
    }).length;
    if (imageCount >= 1) score += 10;
    if (imageCount >= 3) score += 8;
    if (imageCount >= 7) score += 7;

    return score;
  }
}
