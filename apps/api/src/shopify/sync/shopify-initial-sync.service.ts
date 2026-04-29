import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  channelListings,
  integrationAccounts,
  inventoryPositions,
  products,
  syncJobs,
  variants,
} from '@sunday-stripe/db';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../../database/database.constants.js';
import { decryptToken } from '../crypto.util.js';

type Db = PostgresJsDatabase<typeof schema>;

type ShopifyProductSyncResponse = {
  data?: {
    products: {
      pageInfo: {
        hasNextPage: boolean;
        endCursor: string | null;
      };
      edges: Array<{
        node: ShopifyProduct;
      }>;
    };
  };
  errors?: Array<{ message: string }> | string;
  extensions?: {
    cost?: {
      requestedQueryCost?: number;
      throttleStatus?: {
        currentlyAvailable?: number;
        restoreRate?: number;
      };
    };
  };
};

type ShopifyAccessScopesResponse = {
  data?: {
    currentAppInstallation: {
      accessScopes: Array<{
        handle: string;
      }>;
    };
  };
  errors?: Array<{ message: string }> | string;
};

type ShopifyProduct = {
  id: string;
  title: string;
  handle: string;
  status: string;
  publishedAt: string | null;
  updatedAt: string | null;
  descriptionHtml: string | null;
  variants: {
    edges: Array<{
      node: ShopifyVariant;
    }>;
  };
};

type ShopifyVariant = {
  id: string;
  sku: string | null;
  barcode: string | null;
  inventoryItem: {
    id: string;
    inventoryLevels: {
      edges: Array<{
        node: {
          location: {
            id: string;
            name: string;
          };
          quantities: Array<{
            name: string;
            quantity: number;
          }>;
        };
      }>;
    };
  } | null;
};

type IntegrationAccount = typeof integrationAccounts.$inferSelect;

const PRODUCT_SYNC_WITH_INVENTORY_QUERY = `#graphql
  query ProductSync($cursor: String) {
    products(first: 20, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          publishedAt
          updatedAt
          descriptionHtml
          variants(first: 100) {
            edges {
              node {
                id
                sku
                barcode
                inventoryItem {
                  id
                  inventoryLevels(first: 20) {
                    edges {
                      node {
                        location { id }
                        quantities(names: ["available", "committed", "on_hand", "incoming"]) {
                          name
                          quantity
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_SYNC_WITHOUT_INVENTORY_QUERY = `#graphql
  query ProductSync($cursor: String) {
    products(first: 50, after: $cursor) {
      pageInfo { hasNextPage endCursor }
      edges {
        node {
          id
          title
          handle
          status
          publishedAt
          updatedAt
          descriptionHtml
          variants(first: 100) {
            edges {
              node {
                id
                sku
                barcode
                inventoryItem { id }
              }
            }
          }
        }
      }
    }
  }
`;

const ACCESS_SCOPES_QUERY = `#graphql
  query AccessScopes {
    currentAppInstallation {
      accessScopes {
        handle
      }
    }
  }
`;

@Injectable()
export class ShopifyInitialSyncService {
  private readonly logger = new Logger(ShopifyInitialSyncService.name);

  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    @InjectQueue('shopify-sync') private readonly shopifySyncQueue: Queue,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);

    if (!integration.encryptedAccessToken) {
      throw new BadRequestException('Shopify integration is missing an access token');
    }

    const accessToken = decryptToken(integration.encryptedAccessToken);
    const canReadInventory = await this.canReadInventory(integration, accessToken);
    let cursor = syncJob.cursor;

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      while (true) {
        const response = await this.fetchProductsPage(
          integration,
          accessToken,
          cursor,
          canReadInventory,
        );
        const productsPage = response.data?.products;

        if (!productsPage) {
          throw new Error('Shopify response did not include products');
        }

        for (const edge of productsPage.edges) {
          await this.upsertProductTree(integration, edge.node);
        }

        cursor = productsPage.pageInfo.endCursor;
        await this.db
          .update(syncJobs)
          .set({ cursor })
          .where(eq(syncJobs.id, syncJobId));

        if (!productsPage.pageInfo.hasNextPage) {
          break;
        }

        if (this.shouldDeferForThrottle(response)) {
          await this.defer(syncJobId, response);
          return;
        }
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          finishedAt: new Date(),
          errorJson: null,
        })
        .where(eq(syncJobs.id, syncJobId));

      await this.db
        .update(integrationAccounts)
        .set({ lastSyncedAt: new Date(), status: 'active' })
        .where(eq(integrationAccounts.id, integration.id));
    } catch (error) {
      await this.markFailed(syncJobId, error);
      throw error;
    }
  }

  private async getSyncJob(syncJobId: string) {
    const [syncJob] = await this.db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, syncJobId))
      .limit(1);

    if (!syncJob) {
      throw new BadRequestException(`Sync job not found: ${syncJobId}`);
    }

    if (syncJob.jobType !== 'shopify_initial_sync') {
      throw new BadRequestException(`Unsupported sync job type: ${syncJob.jobType}`);
    }

    return syncJob;
  }

  private async getIntegration(integrationAccountId: string): Promise<IntegrationAccount> {
    const [integration] = await this.db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, integrationAccountId))
      .limit(1);

    if (!integration) {
      throw new BadRequestException(`Integration account not found: ${integrationAccountId}`);
    }

    if (integration.platform !== 'shopify' || !integration.shopDomain) {
      throw new BadRequestException('Sync job integration account is not a Shopify shop');
    }

    return integration;
  }

  private async fetchProductsPage(
    integration: IntegrationAccount,
    accessToken: string,
    cursor: string | null,
    includeInventory: boolean,
  ): Promise<ShopifyProductSyncResponse> {
    const apiVersion = this.config.get<string>('SHOPIFY_API_VERSION', '2025-10');
    const response = await fetch(
      `https://${integration.shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({
          query: includeInventory
            ? PRODUCT_SYNC_WITH_INVENTORY_QUERY
            : PRODUCT_SYNC_WITHOUT_INVENTORY_QUERY,
          variables: { cursor },
        }),
      },
    );

    const body = (await response.json()) as ShopifyProductSyncResponse;

    if (!response.ok || body.errors) {
      let message: string;
      if (Array.isArray(body.errors)) {
        message = body.errors.map((e) => e.message).join('; ');
      } else if (typeof body.errors === 'string') {
        message = body.errors;
      } else {
        message = response.statusText;
      }
      throw new Error(`Shopify GraphQL error (${response.status}): ${message}`);
    }

    return body;
  }

  private async canReadInventory(
    integration: IntegrationAccount,
    accessToken: string,
  ): Promise<boolean> {
    const apiVersion = this.config.get<string>('SHOPIFY_API_VERSION', '2025-10');
    const response = await fetch(
      `https://${integration.shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': accessToken,
        },
        body: JSON.stringify({ query: ACCESS_SCOPES_QUERY }),
      },
    );

    const body = (await response.json()) as ShopifyAccessScopesResponse;

    if (!response.ok || body.errors) {
      this.logger.warn('Could not inspect Shopify token scopes; inventory sync will be skipped');
      return false;
    }

    const scopes = body.data?.currentAppInstallation.accessScopes.map((scope) => scope.handle) ?? [];
    const canReadInventory = scopes.includes('read_inventory');

    if (!canReadInventory) {
      this.logger.warn('Shopify token is missing read_inventory; syncing products and variants only');
    }

    return canReadInventory;
  }

  private async upsertProductTree(
    integration: IntegrationAccount,
    product: ShopifyProduct,
  ): Promise<void> {
    const canonicalSku = this.getCanonicalSku(product);
    const [storedProduct] = await this.db
      .insert(products)
      .values({
        workspaceId: integration.workspaceId,
        canonicalSku,
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        sourceOfTruth: 'shopify',
        sourceUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [products.workspaceId, products.canonicalSku],
        set: {
          title: product.title,
          descriptionHtml: product.descriptionHtml,
          sourceUpdatedAt: product.updatedAt ? new Date(product.updatedAt) : null,
          updatedAt: new Date(),
        },
      })
      .returning({ id: products.id });

    for (const variantEdge of product.variants.edges) {
      const storedVariantId = await this.upsertVariant(storedProduct.id, variantEdge.node);
      await this.upsertChannelListing(integration, storedVariantId, product);
      await this.upsertInventoryPositions(integration, storedVariantId, variantEdge.node);
    }
  }

  private async upsertVariant(productId: string, variant: ShopifyVariant): Promise<string> {
    const sku = this.getVariantSku(variant);
    const values = {
      productId,
      sku,
      barcode: variant.barcode,
      optionValuesJson: { shopifyVariantId: variant.id },
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select({ id: variants.id })
      .from(variants)
      .where(and(eq(variants.productId, productId), eq(variants.sku, sku)))
      .limit(1);

    if (existing) {
      await this.db.update(variants).set(values).where(eq(variants.id, existing.id));
      return existing.id;
    }

    const [created] = await this.db
      .insert(variants)
      .values(values)
      .returning({ id: variants.id });

    return created.id;
  }

  private async upsertChannelListing(
    integration: IntegrationAccount,
    variantId: string,
    product: ShopifyProduct,
  ): Promise<void> {
    const status = this.getListingStatus(product);
    const publishedAt = product.publishedAt ? new Date(product.publishedAt) : null;
    const values = {
      variantId,
      integrationAccountId: integration.id,
      platformListingId: product.id,
      status,
      publishedAt,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select({ id: channelListings.id })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.variantId, variantId),
          eq(channelListings.integrationAccountId, integration.id),
          eq(channelListings.platformListingId, product.id),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db.update(channelListings).set(values).where(eq(channelListings.id, existing.id));
      return;
    }

    await this.db.insert(channelListings).values(values);
  }

  private async upsertInventoryPositions(
    integration: IntegrationAccount,
    variantId: string,
    variant: ShopifyVariant,
  ): Promise<void> {
    for (const inventoryLevel of variant.inventoryItem?.inventoryLevels?.edges ?? []) {
      for (const quantity of inventoryLevel.node.quantities) {
        await this.db
          .insert(inventoryPositions)
          .values({
            variantId,
            integrationAccountId: integration.id,
            locationKey: inventoryLevel.node.location.id,
            quantityName: quantity.name,
            quantityValue: quantity.quantity,
            authoritativeSource: 'shopify',
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              inventoryPositions.variantId,
              inventoryPositions.integrationAccountId,
              inventoryPositions.locationKey,
              inventoryPositions.quantityName,
            ],
            set: {
              quantityValue: quantity.quantity,
              authoritativeSource: 'shopify',
              updatedAt: new Date(),
            },
          });
      }
    }
  }

  private async defer(syncJobId: string, response: ShopifyProductSyncResponse): Promise<void> {
    const delay = this.getThrottleDelay(response);

    await this.db
      .update(syncJobs)
      .set({ state: 'pending' })
      .where(eq(syncJobs.id, syncJobId));

    await this.shopifySyncQueue.add(
      'shopify_initial_sync',
      { syncJobId },
      {
        delay,
        attempts: 5,
        backoff: {
          type: 'exponential',
          delay: 30_000,
        },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );

    this.logger.log(`Deferred Shopify initial sync ${syncJobId} for ${delay}ms due to throttle`);
  }

  private shouldDeferForThrottle(response: ShopifyProductSyncResponse): boolean {
    const requested = response.extensions?.cost?.requestedQueryCost;
    const available = response.extensions?.cost?.throttleStatus?.currentlyAvailable;

    if (requested === undefined || available === undefined) {
      return false;
    }

    return available < requested;
  }

  private getThrottleDelay(response: ShopifyProductSyncResponse): number {
    const requested = response.extensions?.cost?.requestedQueryCost ?? 50;
    const available = response.extensions?.cost?.throttleStatus?.currentlyAvailable ?? 0;
    const restoreRate = response.extensions?.cost?.throttleStatus?.restoreRate ?? 50;
    const pointsNeeded = Math.max(requested - available, 1);

    return Math.ceil((pointsNeeded / restoreRate) * 1000);
  }

  private async markFailed(syncJobId: string, error: unknown): Promise<void> {
    await this.db
      .update(syncJobs)
      .set({
        state: 'failed',
        errorJson: this.serializeError(error),
        finishedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJobId));
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }

  private getCanonicalSku(product: ShopifyProduct): string {
    const variantSku = product.variants.edges
      .map((edge) => edge.node.sku?.trim())
      .find((sku): sku is string => Boolean(sku));

    return variantSku ?? product.handle ?? product.id;
  }

  private getVariantSku(variant: ShopifyVariant): string {
    const sku = variant.sku?.trim();
    return sku || variant.id;
  }

  private getListingStatus(product: ShopifyProduct): string {
    if (product.status === 'ACTIVE' && product.publishedAt) {
      return 'published';
    }

    return 'unlisted';
  }

  private toGrams(weight: number | null, unit: string | null): number | null {
    if (weight === null || weight === undefined || !unit) {
      return null;
    }

    const multipliers: Record<string, number> = {
      GRAMS: 1,
      KILOGRAMS: 1000,
      OUNCES: 28.3495,
      POUNDS: 453.592,
    };

    const multiplier = multipliers[unit];
    return multiplier ? Math.round(weight * multiplier) : null;
  }
}
