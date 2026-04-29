import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@sunday-stripe/db';
import {
  alerts,
  channelListings,
  integrationAccounts,
  inventoryPositions,
  products,
  variants,
} from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { decryptToken } from './crypto.util.js';
import { SHOPIFY_WEBHOOK_QUEUE, type WebhookJobData } from './shopify-webhook.types.js';

type Db = PostgresJsDatabase<typeof schema>;
type IntegrationAccount = typeof integrationAccounts.$inferSelect;

type ShopifyGraphQLResponse<T> = {
  data?: T;
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
    inventoryLevels?: {
      edges: Array<{
        node: {
          location: {
            id: string;
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

const PRODUCT_BY_ID_QUERY = `#graphql
  query ProductById($id: ID!) {
    product: node(id: $id) {
      ... on Product {
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
`;

const PRODUCT_BY_INVENTORY_ITEM_QUERY = `#graphql
  query ProductByInventoryItem($id: ID!) {
    inventoryItem: node(id: $id) {
      ... on InventoryItem {
        id
        variant {
          product {
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
  }
`;

@Processor(SHOPIFY_WEBHOOK_QUEUE)
export class ShopifyWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyWebhookProcessor.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { topic, shopDomain, webhookId, payload } = job.data;
    this.logger.debug(`Processing webhook topic=${topic} shop=${shopDomain} id=${webhookId}`);

    switch (topic) {
      case 'PRODUCTS_UPDATE':
        await this.handleProductUpdate(shopDomain, payload);
        break;
      case 'PRODUCTS_DELETE':
        await this.handleProductDelete(shopDomain, payload);
        break;
      case 'INVENTORY_LEVELS_UPDATE':
        await this.handleInventoryUpdate(shopDomain, payload);
        break;
    }
  }

  private async handleProductUpdate(
    shopDomain: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const productGid = payload['admin_graphql_api_id'] as string | undefined;
    if (!productGid) {
      this.logger.warn(`PRODUCTS_UPDATE missing admin_graphql_api_id shop=${shopDomain}`);
      return;
    }

    const account = await this.getShopifyAccount(shopDomain);
    const product = await this.fetchProduct(account, productGid);
    if (!product) {
      this.logger.warn(`PRODUCTS_UPDATE could not find product gid=${productGid} shop=${shopDomain}`);
      return;
    }

    await this.upsertProductTree(account, product);
    await this.touchIntegration(account.id);
    this.logger.log(`PRODUCTS_UPDATE synced gid=${productGid} shop=${shopDomain}`);
  }

  /**
   * Marks all channel_listings for this Shopify product GID as 'unlisted'.
   * Safe to implement now — no GraphQL re-fetch needed.
   */
  private async handleProductDelete(
    shopDomain: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const productGid = payload['admin_graphql_api_id'] as string | undefined;
    if (!productGid) {
      this.logger.warn(`PRODUCTS_DELETE missing admin_graphql_api_id shop=${shopDomain}`);
      return;
    }

    const account = await this.getShopifyAccount(shopDomain);

    await this.db
      .update(channelListings)
      .set({ status: 'unlisted', lastSeenAt: new Date() })
      .where(
        and(
          eq(channelListings.integrationAccountId, account.id),
          eq(channelListings.platformListingId, productGid),
        ),
      );

    await this.touchIntegration(account.id);
    this.logger.log(`PRODUCTS_DELETE marked unlisted gid=${productGid} shop=${shopDomain}`);
  }

  private async handleInventoryUpdate(
    shopDomain: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const inventoryItemId = payload['inventory_item_id'] as number | undefined;
    if (!inventoryItemId) {
      this.logger.warn(`INVENTORY_LEVELS_UPDATE missing inventory_item_id shop=${shopDomain}`);
      return;
    }

    const account = await this.getShopifyAccount(shopDomain);
    const product = await this.fetchProductByInventoryItem(account, inventoryItemId);
    if (!product) {
      this.logger.warn(
        `INVENTORY_LEVELS_UPDATE could not find product for inventory_item_id=${inventoryItemId} shop=${shopDomain}`,
      );
      return;
    }

    await this.upsertProductTree(account, product);
    await this.touchIntegration(account.id);
    this.logger.log(`INVENTORY_LEVELS_UPDATE synced item=${inventoryItemId} shop=${shopDomain}`);
  }

  private async getShopifyAccount(shopDomain: string): Promise<IntegrationAccount> {
    const [account] = await this.db
      .select()
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.platform, 'shopify'),
          eq(integrationAccounts.shopDomain, shopDomain),
        ),
      )
      .limit(1);

    if (!account) {
      throw new Error(`No Shopify integration account found for shop=${shopDomain}`);
    }

    if (!account.encryptedAccessToken) {
      throw new Error(`Shopify integration account is missing an access token for shop=${shopDomain}`);
    }

    return account;
  }

  private async fetchProduct(
    account: IntegrationAccount,
    productGid: string,
  ): Promise<ShopifyProduct | null> {
    const data = await this.graphql<{ product: ShopifyProduct | null }>(account, PRODUCT_BY_ID_QUERY, {
      id: productGid,
    });

    return data.product;
  }

  private async fetchProductByInventoryItem(
    account: IntegrationAccount,
    inventoryItemLegacyId: number,
  ): Promise<ShopifyProduct | null> {
    const inventoryItemGid = `gid://shopify/InventoryItem/${inventoryItemLegacyId}`;
    const data = await this.graphql<{
      inventoryItem: {
        variant: {
          product: ShopifyProduct | null;
        } | null;
      } | null;
    }>(account, PRODUCT_BY_INVENTORY_ITEM_QUERY, { id: inventoryItemGid });

    return data.inventoryItem?.variant?.product ?? null;
  }

  private async graphql<T>(
    account: IntegrationAccount,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const apiVersion = this.config.get<string>('SHOPIFY_API_VERSION', '2025-10');
    const response = await fetch(
      `https://${account.shopDomain}/admin/api/${apiVersion}/graphql.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': decryptToken(account.encryptedAccessToken!),
        },
        body: JSON.stringify({ query, variables }),
      },
    );

    const body = (await response.json()) as ShopifyGraphQLResponse<T>;
    if (!response.ok || body.errors) {
      const message = Array.isArray(body.errors)
        ? body.errors.map((error) => error.message).join('; ')
        : body.errors || response.statusText;
      throw new Error(`Shopify GraphQL error (${response.status}): ${message}`);
    }

    if (!body.data) {
      throw new Error('Shopify GraphQL response did not include data');
    }

    return body.data;
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
      optionValuesJson: {
        shopifyVariantId: variant.id,
        shopifyInventoryItemId: variant.inventoryItem?.id ?? null,
      },
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
    const values = {
      variantId,
      integrationAccountId: integration.id,
      platformListingId: product.id,
      status: this.getListingStatus(product),
      publishedAt: product.publishedAt ? new Date(product.publishedAt) : null,
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

  private async touchIntegration(integrationAccountId: string): Promise<void> {
    await this.db
      .update(integrationAccounts)
      .set({ lastSyncedAt: new Date(), status: 'active' })
      .where(eq(integrationAccounts.id, integrationAccountId));
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

  /** After 3 failed attempts, write an alert so the dashboard can surface it. */
  @OnWorkerEvent('failed')
  async onFailed(job: Job<WebhookJobData>, error: Error): Promise<void> {
    if (job.attemptsMade < (job.opts.attempts ?? 3)) return;

    this.logger.error(
      `Webhook job exhausted retries topic=${job.data.topic} shop=${job.data.shopDomain} id=${job.id}`,
      error.stack,
    );

    try {
      // Resolve workspace for this shop to attach the alert
      const [account] = await this.db
        .select({ workspaceId: integrationAccounts.workspaceId })
        .from(integrationAccounts)
        .where(
          and(
            eq(integrationAccounts.platform, 'shopify'),
            eq(integrationAccounts.shopDomain, job.data.shopDomain),
          ),
        )
        .limit(1);

      if (account) {
        await this.db.insert(alerts).values({
          workspaceId: account.workspaceId,
          severity: 'high',
          category: 'sync_lag',
          sourcePlatform: 'shopify',
          entityRef: job.data.webhookId,
          payloadJson: {
            topic: job.data.topic,
            jobId: job.id,
            error: error.message,
          },
        });
      }
    } catch (alertErr) {
      this.logger.error('Failed to write DLQ alert', alertErr);
    }
  }
}
