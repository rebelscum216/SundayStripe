import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  integrationAccounts,
  orderLineItems,
  orders,
  syncJobs,
  variants,
} from '@sunday-stripe/db';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { AmazonApiService, type AmazonSalesOrder, type AmazonSalesOrderItem } from './amazon-api.service.js';

type Db = PostgresJsDatabase<typeof schema>;
type IntegrationAccount = typeof integrationAccounts.$inferSelect;

@Injectable()
export class AmazonOrdersSyncService {
  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly amazonApi: AmazonApiService,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      let orderCount = 0;
      let lineItemCount = 0;
      const amazonOrders = await this.amazonApi.fetchOrders(90);

      for (const amazonOrder of amazonOrders) {
        const storedOrderId = await this.upsertOrder(integration, amazonOrder);
        orderCount += 1;

        const items = await this.amazonApi.fetchOrderItems(amazonOrder.id);
        for (const item of items) {
          await this.insertLineItem(storedOrderId, item);
          lineItemCount += 1;
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          cursor: null,
          payloadJson: { amazon_order_count: orderCount, amazon_line_item_count: lineItemCount },
          errorJson: null,
          finishedAt: new Date(),
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

    if (syncJob.jobType !== 'amazon_orders_sync') {
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

    if (integration.platform !== 'amazon_sp') {
      throw new BadRequestException('Sync job integration account is not Amazon SP-API');
    }

    return integration;
  }

  private async upsertOrder(integration: IntegrationAccount, amazonOrder: AmazonSalesOrder): Promise<string> {
    const [storedOrder] = await this.db
      .insert(orders)
      .values({
        workspaceId: integration.workspaceId,
        integrationAccountId: integration.id,
        shopifyOrderId: amazonOrder.id,
        createdAt: new Date(amazonOrder.purchaseDate),
        financialStatus: amazonOrder.status,
        totalPriceCents: this.toCents(amazonOrder.totalAmount),
        currency: amazonOrder.currency ?? 'USD',
      })
      .onConflictDoUpdate({
        target: [orders.integrationAccountId, orders.shopifyOrderId],
        set: {
          createdAt: new Date(amazonOrder.purchaseDate),
          financialStatus: amazonOrder.status,
          totalPriceCents: this.toCents(amazonOrder.totalAmount),
          currency: amazonOrder.currency ?? 'USD',
        },
      })
      .returning({ id: orders.id });

    return storedOrder.id;
  }

  private async insertLineItem(orderId: string, item: AmazonSalesOrderItem): Promise<void> {
    const variantMatch = item.sku ? await this.findVariantBySku(item.sku) : null;
    const quantity = item.quantity || 1;
    const totalCents = this.toCents(item.totalAmount);

    await this.db
      .insert(orderLineItems)
      .values({
        orderId,
        shopifyLineItemId: item.id,
        productId: variantMatch?.productId ?? null,
        variantId: variantMatch?.id ?? null,
        shopifyProductId: item.asin,
        shopifyVariantId: item.sku,
        sku: item.sku,
        title: item.title,
        quantity,
        unitPriceCents: Math.round(totalCents / quantity),
      })
      .onConflictDoUpdate({
        target: [orderLineItems.orderId, orderLineItems.shopifyLineItemId],
        set: {
          productId: variantMatch?.productId ?? null,
          variantId: variantMatch?.id ?? null,
          shopifyProductId: item.asin,
          shopifyVariantId: item.sku,
          sku: item.sku,
          title: item.title,
          quantity,
          unitPriceCents: Math.round(totalCents / quantity),
        },
      });
  }

  private async findVariantBySku(sku: string) {
    const [variant] = await this.db
      .select({ id: variants.id, productId: variants.productId })
      .from(variants)
      .where(eq(variants.sku, sku))
      .limit(1);

    return variant ?? null;
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

  private toCents(value: string | null): number {
    if (!value) return 0;
    return Math.round(Number.parseFloat(value) * 100);
  }
}
