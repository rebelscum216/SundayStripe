import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@sunday-stripe/db';
import { channelListings, integrationAccounts, alerts } from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { SHOPIFY_WEBHOOK_QUEUE, type WebhookJobData } from './shopify-webhook.types.js';

type Db = PostgresJsDatabase<typeof schema>;

@Processor(SHOPIFY_WEBHOOK_QUEUE)
export class ShopifyWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(ShopifyWebhookProcessor.name);

  constructor(@Inject(DRIZZLE_DATABASE) private readonly db: Db) {
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

  /**
   * Re-fetches the full product from Shopify Admin GraphQL and upserts local state.
   * TODO (Task 4): inject ShopifyGraphQLClient and call client.fetchProduct(gid).
   *   Then call the same upsert helpers Task 4 builds for the initial sync worker.
   *   The webhook payload is intentionally NOT used as the source of truth — always
   *   re-fetch to avoid acting on stale or partial event data.
   */
  private async handleProductUpdate(
    shopDomain: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const productGid = payload['admin_graphql_api_id'] as string | undefined;
    if (!productGid) {
      this.logger.warn(`PRODUCTS_UPDATE missing admin_graphql_api_id shop=${shopDomain}`);
      return;
    }

    // TODO (Task 4): const client = this.graphqlClientFactory.forShop(shopDomain);
    //               const product = await client.fetchProduct(productGid);
    //               await upsertProduct(this.db, integrationAccountId, product);
    this.logger.debug(`PRODUCTS_UPDATE acknowledged gid=${productGid} — awaiting Task 4 GraphQL client`);
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

    // Resolve integration account for this shop
    const [account] = await this.db
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.platform, 'shopify'),
          eq(integrationAccounts.shopDomain, shopDomain),
        ),
      )
      .limit(1);

    if (!account) {
      this.logger.warn(`PRODUCTS_DELETE: no integration account found for shop=${shopDomain}`);
      return;
    }

    const result = await this.db
      .update(channelListings)
      .set({ status: 'unlisted', lastSeenAt: new Date() })
      .where(
        and(
          eq(channelListings.integrationAccountId, account.id),
          eq(channelListings.platformListingId, productGid),
        ),
      );

    this.logger.log(`PRODUCTS_DELETE marked unlisted gid=${productGid} shop=${shopDomain}`);
  }

  /**
   * Re-fetches inventory levels for the affected inventory item from Shopify.
   * TODO (Task 4): inject ShopifyGraphQLClient and call client.fetchInventoryLevels(inventoryItemId).
   *   Then upsert inventory_positions using the same helpers as the initial sync worker.
   */
  private async handleInventoryUpdate(
    shopDomain: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const inventoryItemId = payload['inventory_item_id'] as number | undefined;
    if (!inventoryItemId) {
      this.logger.warn(`INVENTORY_LEVELS_UPDATE missing inventory_item_id shop=${shopDomain}`);
      return;
    }

    // TODO (Task 4): const client = this.graphqlClientFactory.forShop(shopDomain);
    //               const levels = await client.fetchInventoryLevels(inventoryItemId);
    //               await upsertInventoryPositions(this.db, integrationAccountId, levels);
    this.logger.debug(`INVENTORY_LEVELS_UPDATE acknowledged item=${inventoryItemId} — awaiting Task 4 GraphQL client`);
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
