import 'dotenv/config';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { Queue } from 'bullmq';
import { eq } from 'drizzle-orm';
import * as schema from '@sunday-stripe/db';
import { integrationAccounts, syncJobs, workspaces } from '@sunday-stripe/db';
import { GSC_SYNC_QUEUE } from '../gsc/gsc.types.js';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/hub';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379';
const GSC_SITE = process.env.GSC_SITE ?? 'sc-domain:sundaystripe.com';

const sql = postgres(DATABASE_URL, { max: 1 });
const db = drizzle(sql, { schema });

const [workspace] = await db.select().from(workspaces).limit(1);
if (!workspace) {
  console.error('No workspace found. Run seed-shopify.ts first.');
  process.exit(1);
}

let [integration] = await db
  .select()
  .from(integrationAccounts)
  .where(eq(integrationAccounts.platform, 'search_console'))
  .limit(1);

if (!integration) {
  [integration] = await db
    .insert(integrationAccounts)
    .values({
      workspaceId: workspace.id,
      platform: 'search_console',
      externalAccountId: GSC_SITE,
      status: 'active',
    })
    .returning();
  console.log('Created search_console integration account');
} else {
  console.log('Using existing search_console integration account');
}

const [syncJob] = await db
  .insert(syncJobs)
  .values({
    integrationAccountId: integration.id,
    jobType: 'gsc_initial_sync',
    state: 'pending',
  })
  .returning();

const queue = new Queue(GSC_SYNC_QUEUE, { connection: { url: REDIS_URL } });
await queue.add('gsc_initial_sync', { syncJobId: syncJob.id }, { attempts: 3, backoff: { type: 'exponential', delay: 5000 } });
await queue.close();

console.log(`Enqueued gsc_initial_sync job ${syncJob.id}`);
await sql.end();
