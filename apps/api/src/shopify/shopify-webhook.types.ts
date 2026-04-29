export const SHOPIFY_WEBHOOK_QUEUE = 'shopify-webhooks';

export type WebhookTopic =
  | 'PRODUCTS_UPDATE'
  | 'PRODUCTS_DELETE'
  | 'INVENTORY_LEVELS_UPDATE';

export interface WebhookJobData {
  topic: WebhookTopic;
  shopDomain: string;
  /** X-Shopify-Webhook-Id header — used as BullMQ job ID for idempotency */
  webhookId: string;
  payload: Record<string, unknown>;
}

/** Maps Shopify's slash-separated topic header to our enum */
export function normalizeShopifyTopic(raw: string): WebhookTopic | null {
  const map: Record<string, WebhookTopic> = {
    'products/update': 'PRODUCTS_UPDATE',
    'products/delete': 'PRODUCTS_DELETE',
    'inventory_levels/update': 'INVENTORY_LEVELS_UPDATE',
  };
  return map[raw.toLowerCase()] ?? null;
}
