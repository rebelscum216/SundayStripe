/**
 * One-time seed script: creates the Google Merchant integration account for
 * the configured Merchant Center account and enqueues the initial listing sync.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/seed-merchant.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '../../.env') });

import { Queue } from 'bullmq';
import { and, eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { integrationAccounts, syncJobs, workspaces } from '@sunday-stripe/db';
import { MERCHANT_SYNC_QUEUE } from '../merchant/merchant.types.js';

const merchantAccountId = process.env.GOOGLE_MERCHANT_ID;
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

if (!merchantAccountId || !databaseUrl) {
  console.error('Missing required env vars: GOOGLE_MERCHANT_ID, DATABASE_URL');
  process.exit(1);
}

const client = postgres(databaseUrl);
const db = drizzle(client);

async function seed() {
  console.log(`Seeding Google Merchant integration for account=${merchantAccountId}`);

  const workspaceId = await getWorkspaceId();
  const integrationAccountId = await upsertIntegrationAccount(workspaceId);

  const [syncJob] = await db
    .insert(syncJobs)
    .values({
      integrationAccountId,
      jobType: 'merchant_initial_sync',
      state: 'pending',
    })
    .returning({ id: syncJobs.id });

  const queue = new Queue(MERCHANT_SYNC_QUEUE, { connection: { url: redisUrl } });
  await queue.add(
    'merchant_initial_sync',
    { syncJobId: syncJob.id },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  await queue.close();

  console.log(`Enqueued Merchant sync job id=${syncJob.id}`);
  await client.end();
}

async function getWorkspaceId(): Promise<string> {
  const shopDomain = process.env.SHOPIFY_SHOP;

  if (shopDomain) {
    const [shopifyIntegration] = await db
      .select({ workspaceId: integrationAccounts.workspaceId })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.platform, 'shopify'),
          eq(integrationAccounts.shopDomain, shopDomain),
        ),
      )
      .limit(1);

    if (shopifyIntegration) {
      return shopifyIntegration.workspaceId;
    }
  }

  const [workspace] = await db.select({ id: workspaces.id }).from(workspaces).limit(1);
  if (workspace) {
    return workspace.id;
  }

  const [created] = await db
    .insert(workspaces)
    .values({ name: 'Default Workspace' })
    .returning({ id: workspaces.id });

  return created.id;
}

async function upsertIntegrationAccount(workspaceId: string): Promise<string> {
  const [existing] = await db
    .select({ id: integrationAccounts.id })
    .from(integrationAccounts)
    .where(
      and(
        eq(integrationAccounts.platform, 'merchant'),
        eq(integrationAccounts.externalAccountId, merchantAccountId!),
      ),
    )
    .limit(1);

  if (existing) {
    await db
      .update(integrationAccounts)
      .set({
        workspaceId,
        status: 'active',
      })
      .where(eq(integrationAccounts.id, existing.id));
    console.log(`Updated existing Merchant integration id=${existing.id}`);
    return existing.id;
  }

  const [created] = await db
    .insert(integrationAccounts)
    .values({
      workspaceId,
      platform: 'merchant',
      externalAccountId: merchantAccountId!,
      status: 'active',
    })
    .returning({ id: integrationAccounts.id });

  console.log(`Created Merchant integration id=${created.id}`);
  return created.id;
}

seed().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
