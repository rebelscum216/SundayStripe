import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { integrationAccounts, syncJobs } from '@sunday-stripe/db';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Queue } from 'bullmq';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { MERCHANT_SYNC_QUEUE, type MerchantInitialSyncJob } from './merchant.types.js';

type Db = PostgresJsDatabase<typeof schema>;

@Injectable()
export class MerchantSchedulerService {
  private readonly logger = new Logger(MerchantSchedulerService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    @InjectQueue(MERCHANT_SYNC_QUEUE) private readonly merchantQueue: Queue<MerchantInitialSyncJob>,
  ) {}

  @Cron('0 2 * * *')
  async scheduleDailySync(): Promise<void> {
    this.logger.log('Starting scheduled Merchant Center sync enqueue');

    const integrations = await this.db
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.platform, 'merchant'));

    if (integrations.length === 0) {
      this.logger.warn('Skipping scheduled Merchant sync: no merchant integration account found');
      return;
    }

    for (const integration of integrations) {
      const [syncJob] = await this.db
        .insert(syncJobs)
        .values({
          integrationAccountId: integration.id,
          jobType: 'merchant_initial_sync',
          state: 'pending',
        })
        .returning({ id: syncJobs.id });

      await this.merchantQueue.add('merchant_initial_sync', { syncJobId: syncJob.id });

      this.logger.log(
        `Scheduled Merchant sync enqueued integrationAccountId=${integration.id} syncJobId=${syncJob.id}`,
      );
    }
  }
}
