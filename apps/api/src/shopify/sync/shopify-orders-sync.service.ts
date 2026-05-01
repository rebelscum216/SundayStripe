import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  integrationAccounts,
  orderLineItems,
  orders,
  syncJobs,
  variants,
} from '@sunday-stripe/db';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../../database/database.constants.js';
import { decryptToken } from '../crypto.util.js';

type Db = PostgresJsDatabase<typeof schema>;

type IntegrationAccount = typeof integrationAccounts.$inferSelect;

type ShopifyOrder = {
  id: number | string;
  created_at: string;
  financial_status: string | null;
  total_price: string;
  currency: string | null;
  line_items?: ShopifyLineItem[];
};

type ShopifyLineItem = {
  id: number | string;
  product_id: number | string | null;
  variant_id: number | string | null;
  sku: string | null;
  title: string | null;
  quantity: number;
  price: string;
};

type ShopifyOrdersResponse = {
  orders?: ShopifyOrder[];
};

@Injectable()
export class ShopifyOrdersSyncService {
  constructor(
    private readonly config: ConfigService,
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);

    if (!integration.encryptedAccessToken) {
      throw new BadRequestException('Shopify integration is missing an access token');
    }

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      const accessToken = decryptToken(integration.encryptedAccessToken);
      const createdAtMin = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      let url: string | null = this.buildOrdersUrl(integration.shopDomain!, createdAtMin);
      let orderCount = 0;
      let lineItemCount = 0;

      while (url) {
        const { orders: shopifyOrders, nextUrl } = await this.fetchOrdersPage(url, accessToken);

        for (const shopifyOrder of shopifyOrders) {
          const storedOrderId = await this.upsertOrder(integration, shopifyOrder);
          orderCount += 1;

          for (const lineItem of shopifyOrder.line_items ?? []) {
            await this.insertLineItem(storedOrderId, lineItem);
            lineItemCount += 1;
          }
        }

        url = nextUrl;
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          payloadJson: { order_count: orderCount, line_item_count: lineItemCount },
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

    if (syncJob.jobType !== 'shopify_orders_sync') {
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

  private buildOrdersUrl(shopDomain: string, createdAtMin: string): string {
    const apiVersion = this.config.get<string>('SHOPIFY_ORDERS_API_VERSION', '2024-04');
    const url = new URL(`https://${shopDomain}/admin/api/${apiVersion}/orders.json`);
    url.searchParams.set('status', 'any');
    url.searchParams.set('financial_status', 'paid');
    url.searchParams.set('limit', '250');
    url.searchParams.set('created_at_min', createdAtMin);
    url.searchParams.set(
      'fields',
      'id,created_at,financial_status,total_price,currency,line_items',
    );
    return url.toString();
  }

  private async fetchOrdersPage(
    url: string,
    accessToken: string,
  ): Promise<{ orders: ShopifyOrder[]; nextUrl: string | null }> {
    const response = await fetch(url, {
      headers: {
        'X-Shopify-Access-Token': accessToken,
      },
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Shopify orders fetch failed (${response.status}): ${text}`);
    }

    const body = (await response.json()) as ShopifyOrdersResponse;
    return {
      orders: body.orders ?? [],
      nextUrl: this.getNextLink(response.headers.get('link')),
    };
  }

  private getNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) {
      return null;
    }

    for (const part of linkHeader.split(',')) {
      const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);
      if (match?.[2] === 'next') {
        return match[1];
      }
    }

    return null;
  }

  private async upsertOrder(
    integration: IntegrationAccount,
    shopifyOrder: ShopifyOrder,
  ): Promise<string> {
    const [storedOrder] = await this.db
      .insert(orders)
      .values({
        workspaceId: integration.workspaceId,
        integrationAccountId: integration.id,
        shopifyOrderId: String(shopifyOrder.id),
        createdAt: new Date(shopifyOrder.created_at),
        financialStatus: shopifyOrder.financial_status,
        totalPriceCents: this.toCents(shopifyOrder.total_price),
        currency: shopifyOrder.currency ?? 'USD',
      })
      .onConflictDoUpdate({
        target: [orders.integrationAccountId, orders.shopifyOrderId],
        set: {
          createdAt: new Date(shopifyOrder.created_at),
          financialStatus: shopifyOrder.financial_status,
          totalPriceCents: this.toCents(shopifyOrder.total_price),
          currency: shopifyOrder.currency ?? 'USD',
        },
      })
      .returning({ id: orders.id });

    return storedOrder.id;
  }

  private async insertLineItem(orderId: string, lineItem: ShopifyLineItem): Promise<void> {
    const shopifyVariantId = lineItem.variant_id === null ? null : String(lineItem.variant_id);
    const variantMatch = shopifyVariantId
      ? await this.findVariantByShopifyId(shopifyVariantId)
      : null;

    await this.db
      .insert(orderLineItems)
      .values({
        orderId,
        shopifyLineItemId: String(lineItem.id),
        productId: variantMatch?.productId ?? null,
        variantId: variantMatch?.id ?? null,
        shopifyProductId: lineItem.product_id === null ? null : String(lineItem.product_id),
        shopifyVariantId,
        sku: lineItem.sku,
        title: lineItem.title,
        quantity: lineItem.quantity,
        unitPriceCents: this.toCents(lineItem.price),
      })
      .onConflictDoNothing({
        target: [orderLineItems.orderId, orderLineItems.shopifyLineItemId],
      });
  }

  private async findVariantByShopifyId(shopifyVariantId: string) {
    const graphQlId = shopifyVariantId.startsWith('gid://')
      ? shopifyVariantId
      : `gid://shopify/ProductVariant/${shopifyVariantId}`;

    const [variant] = await this.db
      .select({ id: variants.id, productId: variants.productId })
      .from(variants)
      .where(
        sql`(${variants.optionValuesJson}->>'shopifyVariantId' = ${shopifyVariantId} or ${variants.optionValuesJson}->>'shopifyVariantId' = ${graphQlId})`,
      )
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

  private toCents(value: string): number {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }
}
