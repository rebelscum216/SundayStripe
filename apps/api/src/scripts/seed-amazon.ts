/**
 * One-time seed script: creates the Amazon SP-API integration account for
 * the configured seller and enqueues the initial listing/inventory sync.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/seed-amazon.ts
 */
import { config } from 'dotenv';
import { resolve } from 'node:path';
config({ path: resolve(process.cwd(), '../../.env') });

import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { integrationAccounts, syncJobs, workspaces } from '@sunday-stripe/db';
import { AMAZON_SYNC_QUEUE } from '../amazon/amazon.types.js';

const sellerId = process.env.AMAZON_SELLER_ID;
const marketplaceId = process.env.AMAZON_MARKETPLACE_ID;
const region = process.env.AMAZON_REGION ?? 'us-east-1';
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';

if (!sellerId || !marketplaceId || !databaseUrl) {
  console.error('Missing required env vars: AMAZON_SELLER_ID, AMAZON_MARKETPLACE_ID, DATABASE_URL');
  process.exit(1);
}

const client = postgres(databaseUrl);
const db = drizzle(client);

async function seed() {
  console.log(`Seeding Amazon SP-API integration for seller=${sellerId}`);

  const workspaceId = await getWorkspaceId();
  const integrationAccountId = await upsertIntegrationAccount(workspaceId);

  const [syncJob] = await db
    .insert(syncJobs)
    .values({
      integrationAccountId,
      jobType: 'amazon_initial_sync',
      state: 'pending',
    })
    .returning({ id: syncJobs.id });

  const queue = new Queue(AMAZON_SYNC_QUEUE, { connection: { url: redisUrl } });
  await queue.add(
    'amazon_initial_sync',
    { syncJobId: syncJob.id },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  );
  await queue.close();

  console.log(`Enqueued Amazon sync job id=${syncJob.id}`);
  await client.end();
}

async function getWorkspaceId(): Promise<string> {
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
    .where(eq(integrationAccounts.platform, 'amazon_sp'))
    .limit(1);

  if (existing) {
    await db
      .update(integrationAccounts)
      .set({
        workspaceId,
        marketplaceId: marketplaceId!,
        region,
        status: 'active',
      })
      .where(eq(integrationAccounts.id, existing.id));
    console.log(`Updated existing Amazon integration id=${existing.id}`);
    return existing.id;
  }

  const [created] = await db
    .insert(integrationAccounts)
    .values({
      workspaceId,
      platform: 'amazon_sp',
      externalAccountId: sellerId!,
      marketplaceId: marketplaceId!,
      region,
      status: 'active',
    })
    .returning({ id: integrationAccounts.id });

  console.log(`Created Amazon integration id=${created.id}`);
  return created.id;
}

seed().catch(async (error) => {
  console.error(error);
  await client.end();
  process.exit(1);
});
