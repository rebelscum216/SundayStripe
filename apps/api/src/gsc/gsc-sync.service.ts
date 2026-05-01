import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  integrationAccounts,
  searchPerformance,
  syncJobs,
} from '@sunday-stripe/db';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { GscApiService } from './gsc-api.service.js';

type Db = PostgresJsDatabase<typeof schema>;

const PERIOD_DAYS = 90;

@Injectable()
export class GscSyncService {
  private readonly logger = new Logger(GscSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly gscApi: GscApiService,
    private readonly config: ConfigService,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);
    const siteUrl = this.config.getOrThrow<string>('GSC_SITE');

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      const { startDate, endDate } = this.dateRange(PERIOD_DAYS);
      this.logger.log(`GSC sync ${startDate} → ${endDate} site=${siteUrl}`);

      const [queryRows, pageRows] = await Promise.all([
        this.gscApi.querySearchAnalytics(siteUrl, ['query'], startDate, endDate),
        this.gscApi.querySearchAnalytics(siteUrl, ['page'], startDate, endDate),
      ]);

      const domain = siteUrl.replace('sc-domain:', '');
      const domainPrefix = `https://${domain}`;

      let upserted = 0;

      for (const row of queryRows) {
        await this.upsertRow(integration.id, integration.workspaceId, 'query', row.keys[0], row);
        upserted++;
      }

      for (const row of pageRows) {
        const url = row.keys[0].startsWith(domainPrefix)
          ? row.keys[0].slice(domainPrefix.length) || '/'
          : row.keys[0];
        await this.upsertRow(integration.id, integration.workspaceId, 'page', url, row);
        upserted++;
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          payloadJson: { query_count: queryRows.length, page_count: pageRows.length, upserted },
          finishedAt: new Date(),
          errorJson: null,
        })
        .where(eq(syncJobs.id, syncJobId));

      await this.db
        .update(integrationAccounts)
        .set({ lastSyncedAt: new Date(), status: 'active' })
        .where(eq(integrationAccounts.id, integration.id));

      this.logger.log(`GSC sync done: ${queryRows.length} queries, ${pageRows.length} pages`);
    } catch (error) {
      await this.markFailed(syncJobId, error);
      throw error;
    }
  }

  private async upsertRow(
    integrationAccountId: string,
    workspaceId: string,
    dimension: string,
    dimensionValue: string,
    row: { clicks: number; impressions: number; ctr: number; position: number },
  ): Promise<void> {
    await this.db
      .insert(searchPerformance)
      .values({
        integrationAccountId,
        workspaceId,
        dimension,
        dimensionValue,
        clicks: Math.round(row.clicks),
        impressions: Math.round(row.impressions),
        // store as integers to avoid float precision issues
        ctr: Math.round(row.ctr * 100_000),
        position: Math.round(row.position * 10),
        periodDays: PERIOD_DAYS,
        fetchedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          searchPerformance.integrationAccountId,
          searchPerformance.dimension,
          searchPerformance.dimensionValue,
          searchPerformance.periodDays,
        ],
        set: {
          clicks: Math.round(row.clicks),
          impressions: Math.round(row.impressions),
          ctr: Math.round(row.ctr * 100_000),
          position: Math.round(row.position * 10),
          fetchedAt: new Date(),
        },
      });
  }

  private dateRange(days: number): { startDate: string; endDate: string } {
    const end = new Date();
    end.setDate(end.getDate() - 3);
    const start = new Date(end);
    start.setDate(start.getDate() - days);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }

  private async getSyncJob(syncJobId: string) {
    const [job] = await this.db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, syncJobId))
      .limit(1);

    if (!job) throw new BadRequestException(`Sync job not found: ${syncJobId}`);
    if (job.jobType !== 'gsc_initial_sync') {
      throw new BadRequestException(`Unsupported sync job type: ${job.jobType}`);
    }
    return job;
  }

  private async getIntegration(integrationAccountId: string) {
    const [integration] = await this.db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, integrationAccountId))
      .limit(1);

    if (!integration) throw new BadRequestException(`Integration not found: ${integrationAccountId}`);
    if (integration.platform !== 'search_console') {
      throw new BadRequestException('Integration is not search_console');
    }
    return integration;
  }

  private async markFailed(syncJobId: string, error: unknown): Promise<void> {
    const err = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { message: String(error) };

    await this.db
      .update(syncJobs)
      .set({ state: 'failed', errorJson: err, finishedAt: new Date() })
      .where(eq(syncJobs.id, syncJobId));
  }
}
