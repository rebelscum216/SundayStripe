/**
 * One-time seed script: creates a Shopify orders sync job for the first
 * configured Shopify integration and enqueues the 90-day orders sync.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/seed-orders.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '../../.env') });

import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { integrationAccounts, syncJobs } from '@sunday-stripe/db';

const shopDomain = process.env.SHOPIFY_SHOP;
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

if (!databaseUrl) {
  console.error('Missing required env var: DATABASE_URL');
  process.exit(1);
}

const client = postgres(databaseUrl);
const db = drizzle(client);

async function seed() {
  console.log('Seeding Shopify orders sync job');

  const integrationAccountId = await getShopifyIntegrationAccountId();

  const [syncJob] = await db
    .insert(syncJobs)
    .values({
      integrationAccountId,
      jobType: 'shopify_orders_sync',
      state: 'pending',
    })
    .returning({ id: syncJobs.id });

  const queue = new Queue('shopify-orders-sync', { connection: { url: redisUrl } });
  await queue.add(
    'shopify_orders_sync',
    { syncJobId: syncJob.id },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  await queue.close();

  console.log(`Enqueued Shopify orders sync job id=${syncJob.id}`);
  await client.end();
}

async function getShopifyIntegrationAccountId(): Promise<string> {
  const where = shopDomain
    ? and(
        eq(integrationAccounts.platform, 'shopify'),
        eq(integrationAccounts.shopDomain, shopDomain),
      )
    : eq(integrationAccounts.platform, 'shopify');

  const [integration] = await db
    .select({ id: integrationAccounts.id })
    .from(integrationAccounts)
    .where(where)
    .limit(1);

  if (!integration) {
    throw new Error(
      shopDomain
        ? `No Shopify integration found for SHOPIFY_SHOP=${shopDomain}`
        : 'No Shopify integration found',
    );
  }

  return integration.id;
}

seed().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
