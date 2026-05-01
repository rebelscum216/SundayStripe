import { InjectQueue } from '@nestjs/bullmq';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { integrationAccounts, syncJobs } from '@sunday-stripe/db';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type { Queue } from 'bullmq';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { GSC_SYNC_QUEUE, type GscInitialSyncJob } from './gsc.types.js';

type Db = PostgresJsDatabase<typeof schema>;

@Injectable()
export class GscSchedulerService {
  private readonly logger = new Logger(GscSchedulerService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    @InjectQueue(GSC_SYNC_QUEUE) private readonly gscQueue: Queue<GscInitialSyncJob>,
  ) {}

  @Cron('0 3 * * *')
  async scheduleDailySync(): Promise<void> {
    this.logger.log('Starting scheduled GSC sync enqueue');

    const integrations = await this.db
      .select({ id: integrationAccounts.id })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.platform, 'search_console'));

    if (integrations.length === 0) {
      this.logger.warn('Skipping scheduled GSC sync: no search_console integration account found');
      return;
    }

    for (const integration of integrations) {
      const [syncJob] = await this.db
        .insert(syncJobs)
        .values({
          integrationAccountId: integration.id,
          jobType: 'gsc_initial_sync',
          state: 'pending',
        })
        .returning({ id: syncJobs.id });

      await this.gscQueue.add('gsc_initial_sync', { syncJobId: syncJob.id });

      this.logger.log(
        `Scheduled GSC sync enqueued integrationAccountId=${integration.id} syncJobId=${syncJob.id}`,
      );
    }
  }
}
