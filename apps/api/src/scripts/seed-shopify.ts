/**
 * One-time seed script: creates the workspace + integration_account for the
 * configured Shopify store and enqueues the initial product sync.
 *
 * Run from apps/api:
 *   npx tsx src/scripts/seed-shopify.ts
 */
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '../../.env') });
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Queue } from 'bullmq';
import { eq, and } from 'drizzle-orm';
import { workspaces, integrationAccounts, syncJobs } from '@sunday-stripe/db';
import { encryptToken } from '../shopify/crypto.util.js';

const shop = process.env.SHOPIFY_SHOP;
const accessToken = process.env.SHOPIFY_ACCESS_TOKEN;
const databaseUrl = process.env.DATABASE_URL;
const redisUrl = process.env.REDIS_URL ?? 'redis://localhost:6379';
const scopes = process.env.SHOPIFY_SCOPES ?? 'read_products,write_products,read_inventory,write_inventory';

if (!shop || !accessToken || !databaseUrl) {
  console.error('Missing required env vars: SHOPIFY_SHOP, SHOPIFY_ACCESS_TOKEN, DATABASE_URL');
  process.exit(1);
}

if (!accessToken.startsWith('shpat_')) {
  console.warn('Warning: SHOPIFY_ACCESS_TOKEN does not look like a CLI-generated token (expected shpat_ prefix)');
}

const client = postgres(databaseUrl);
const db = drizzle(client);

async function seed() {
  console.log(`Seeding integration for shop=${shop}`);

  // 1. Find or create workspace
  const existing = await db.select().from(workspaces).where(eq(workspaces.name, shop!)).limit(1);
  let workspaceId: string;

  if (existing.length > 0) {
    workspaceId = existing[0].id;
    console.log(`Using existing workspace id=${workspaceId}`);
  } else {
    const [created] = await db.insert(workspaces).values({ name: shop! }).returning({ id: workspaces.id });
    workspaceId = created.id;
    console.log(`Created workspace id=${workspaceId}`);
  }

  // 2. Find or create integration account
  const existingAccount = await db
    .select()
    .from(integrationAccounts)
    .where(and(eq(integrationAccounts.platform, 'shopify'), eq(integrationAccounts.shopDomain, shop!)))
    .limit(1);

  let integrationAccountId: string;

  if (existingAccount.length > 0) {
    integrationAccountId = existingAccount[0].id;
    await db
      .update(integrationAccounts)
      .set({ encryptedAccessToken: encryptToken(accessToken!), status: 'active' })
      .where(eq(integrationAccounts.id, integrationAccountId));
    console.log(`Updated existing integration account id=${integrationAccountId}`);
  } else {
    const [created] = await db
      .insert(integrationAccounts)
      .values({
        workspaceId,
        platform: 'shopify',
        shopDomain: shop!,
        externalAccountId: shop!,
        encryptedAccessToken: encryptToken(accessToken!),
        status: 'active',
        scopesJson: { scopes },
      })
      .returning({ id: integrationAccounts.id });
    integrationAccountId = created.id;
    console.log(`Created integration account id=${integrationAccountId}`);
  }

  // 3. Enqueue initial sync if not already queued/running
  const existingJob = await db
    .select()
    .from(syncJobs)
    .where(
      and(
        eq(syncJobs.integrationAccountId, integrationAccountId),
        eq(syncJobs.jobType, 'shopify_initial_sync'),
      ),
    )
    .limit(1);

  if (existingJob.length > 0 && ['pending', 'running'].includes(existingJob[0].state)) {
    console.log(`Initial sync already ${existingJob[0].state} — skipping enqueue`);
  } else {
    const [syncJob] = await db
      .insert(syncJobs)
      .values({ integrationAccountId, jobType: 'shopify_initial_sync', state: 'pending' })
      .returning({ id: syncJobs.id });

    const queue = new Queue('shopify-sync', { connection: { url: redisUrl } });
    await queue.add('shopify_initial_sync', { syncJobId: syncJob.id }, {
      attempts: 5,
      backoff: { type: 'exponential', delay: 30_000 },
      removeOnComplete: 100,
      removeOnFail: 100,
    });
    await queue.close();

    console.log(`Enqueued initial sync job id=${syncJob.id}`);
  }

  console.log('Done. Check /api/status for sync progress.');
  await client.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
