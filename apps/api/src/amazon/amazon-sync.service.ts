import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import {
  alerts,
  channelListings,
  integrationAccounts,
  products,
  syncJobs,
  variants,
} from '@sunday-stripe/db';
import type * as schema from '@sunday-stripe/db';
import { DRIZZLE_DATABASE } from '../database/database.constants.js';
import { AmazonApiService, type AmazonListing } from './amazon-api.service.js';

type Db = PostgresJsDatabase<typeof schema>;
type IntegrationAccount = typeof integrationAccounts.$inferSelect;

@Injectable()
export class AmazonSyncService {
  private readonly logger = new Logger(AmazonSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly amazonApi: AmazonApiService,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      const listings = await this.amazonApi.listListingsItems();
      let syncedListings = 0;
      let issueCount = 0;

      for (const listing of listings) {
        const variantId = await this.findLocalVariantId(integration.workspaceId, listing.sku);
        if (!variantId) {
          this.logger.warn(`Skipping Amazon listing without local SKU match: ${listing.sku}`);
          continue;
        }

        // Fetch attributes individually for matched SKUs to compute quality score
        const attributes = await this.amazonApi.getListingAttributes(listing.sku);
        if (attributes) {
          listing.qualityScore = this.amazonApi.computeQualityScore(attributes);
        }
        // Pace attribute fetches to avoid throttling
        await new Promise((r) => setTimeout(r, 500));

        await this.upsertChannelListing(integration, variantId, listing);
        issueCount += await this.upsertAlerts(integration, listing);
        syncedListings += 1;
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          payloadJson: {
            amazon_listing_count: listings.length,
            synced_listing_count: syncedListings,
            issue_count: issueCount,
          },
          finishedAt: new Date(),
          errorJson: null,
        })
        .where(eq(syncJobs.id, syncJobId));

      await this.db
        .update(integrationAccounts)
        .set({ lastSyncedAt: new Date(), status: 'active' })
        .where(eq(integrationAccounts.id, integration.id));
    } catch (error) {
      await this.markFailed(syncJobId, error);
      throw error;
    }
  }

  private async getSyncJob(syncJobId: string) {
    const [syncJob] = await this.db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.id, syncJobId))
      .limit(1);

    if (!syncJob) {
      throw new BadRequestException(`Sync job not found: ${syncJobId}`);
    }

    if (syncJob.jobType !== 'amazon_initial_sync') {
      throw new BadRequestException(`Unsupported sync job type: ${syncJob.jobType}`);
    }

    return syncJob;
  }

  private async getIntegration(integrationAccountId: string): Promise<IntegrationAccount> {
    const [integration] = await this.db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, integrationAccountId))
      .limit(1);

    if (!integration) {
      throw new BadRequestException(`Integration account not found: ${integrationAccountId}`);
    }

    if (integration.platform !== 'amazon_sp') {
      throw new BadRequestException('Sync job integration account is not Amazon SP-API');
    }

    return integration;
  }

  private async findLocalVariantId(workspaceId: string, sku: string): Promise<string | null> {
    if (!sku.trim()) return null;

    const [match] = await this.db
      .select({ id: variants.id })
      .from(variants)
      .innerJoin(products, eq(variants.productId, products.id))
      .where(and(eq(products.workspaceId, workspaceId), eq(variants.sku, sku)))
      .limit(1);

    return match?.id ?? null;
  }

  private async upsertChannelListing(
    integration: IntegrationAccount,
    variantId: string,
    listing: AmazonListing,
  ): Promise<void> {
    const listingId = this.getListingId(listing);
    const values = {
      variantId,
      integrationAccountId: integration.id,
      platformListingId: listingId,
      status: this.getListingStatus(listing),
      buyabilityStatus: listing.status,
      issuesJson: listing.issues,
      qualityScore: listing.qualityScore,
      lastSeenAt: new Date(),
      updatedAt: new Date(),
    };

    const [existing] = await this.db
      .select({ id: channelListings.id })
      .from(channelListings)
      .where(
        and(
          eq(channelListings.variantId, variantId),
          eq(channelListings.integrationAccountId, integration.id),
          eq(channelListings.platformListingId, listingId),
        ),
      )
      .limit(1);

    if (existing) {
      await this.db.update(channelListings).set(values).where(eq(channelListings.id, existing.id));
      return;
    }

    await this.db.insert(channelListings).values(values);
  }

  private async upsertAlerts(
    integration: IntegrationAccount,
    listing: AmazonListing,
  ): Promise<number> {
    const entityRef = this.getListingId(listing);

    if (listing.issues.length === 0) {
      await this.db
        .update(alerts)
        .set({ status: 'resolved' })
        .where(
          and(
            eq(alerts.workspaceId, integration.workspaceId),
            eq(alerts.category, 'listing_issue'),
            eq(alerts.sourcePlatform, 'amazon_sp'),
            eq(alerts.entityRef, entityRef),
            eq(alerts.status, 'open'),
          ),
        );
      return 0;
    }

    const [existing] = await this.db
      .select({ id: alerts.id })
      .from(alerts)
      .where(
        and(
          eq(alerts.workspaceId, integration.workspaceId),
          eq(alerts.category, 'listing_issue'),
          eq(alerts.sourcePlatform, 'amazon_sp'),
          eq(alerts.entityRef, entityRef),
          eq(alerts.status, 'open'),
        ),
      )
      .limit(1);

    const payload = {
      asin: listing.asin,
      seller_sku: listing.sku,
      status: listing.status,
      issues: listing.issues,
    };

    if (existing) {
      await this.db.update(alerts).set({ payloadJson: payload }).where(eq(alerts.id, existing.id));
    } else {
      await this.db.insert(alerts).values({
        workspaceId: integration.workspaceId,
        severity: this.getAlertSeverity(listing.issues),
        category: 'listing_issue',
        entityRef,
        sourcePlatform: 'amazon_sp',
        payloadJson: payload,
        status: 'open',
      });
    }

    return listing.issues.length;
  }

  private getListingId(listing: AmazonListing): string {
    return listing.asin ?? listing.sku;
  }

  private getListingStatus(listing: AmazonListing): string {
    const status = listing.status.toUpperCase();
    if (status === 'BUYABLE') return 'published';
    if (status === 'DISCOVERABLE') return 'unlisted';
    return 'issue';
  }

  private getAlertSeverity(issues: unknown[]): string {
    return issues.some((issue) => String((issue as { severity?: unknown }).severity ?? '').toLowerCase().includes('error'))
      ? 'high'
      : 'info';
  }

  private async markFailed(syncJobId: string, error: unknown): Promise<void> {
    await this.db
      .update(syncJobs)
      .set({
        state: 'failed',
        errorJson: this.serializeError(error),
        finishedAt: new Date(),
      })
      .where(eq(syncJobs.id, syncJobId));
  }

  private serializeError(error: unknown) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        stack: error.stack,
      };
    }

    return { message: String(error) };
  }
}
