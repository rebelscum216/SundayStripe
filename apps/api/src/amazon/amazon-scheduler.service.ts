import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { integrationAccounts, syncJobs } from '@sunday-stripe/db';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Queue } from 'bullmq';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { AMAZON_SYNC_QUEUE, type AmazonSyncJob } from './amazon.types.js';

type Db = PostgresJsDatabase<typeof schema>;

@Injectable()
export class AmazonSchedulerService {
  private readonly logger = new Logger(AmazonSchedulerService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    @InjectQueue(AMAZON_SYNC_QUEUE) private readonly amazonQueue: Queue<AmazonSyncJob>,
  ) {}

  @Cron('0 6 * * *')
  async scheduleDailySync(): Promise<void> {
    this.logger.log('Starting scheduled Amazon sync enqueue');

    const integrations = await this.db
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.platform, 'amazon_sp'));

    if (integrations.length === 0) {
      this.logger.warn('Skipping scheduled Amazon sync: no amazon_sp integration account found');
      return;
    }

    for (const integration of integrations) {
      await this.enqueueAmazonJob(integration.id, 'amazon_initial_sync');
      await this.enqueueAmazonJob(integration.id, 'amazon_orders_sync');
    }
  }

  private async enqueueAmazonJob(integrationAccountId: string, jobType: 'amazon_initial_sync' | 'amazon_orders_sync') {
    const [syncJob] = await this.db
      .insert(syncJobs)
      .values({
        integrationAccountId,
        jobType,
        state: 'pending',
      })
      .returning({ id: syncJobs.id });

    await this.amazonQueue.add(jobType, { syncJobId: syncJob.id });

    this.logger.log(
      `Scheduled Amazon sync enqueued integrationAccountId=${integrationAccountId} jobType=${jobType} syncJobId=${syncJob.id}`,
    );
  }
}
