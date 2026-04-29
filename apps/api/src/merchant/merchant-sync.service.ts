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
import { MerchantApiService, type MerchantProduct } from './merchant-api.service.js';

type Db = PostgresJsDatabase<typeof schema>;
type IntegrationAccount = typeof integrationAccounts.$inferSelect;

@Injectable()
export class MerchantSyncService {
  private readonly logger = new Logger(MerchantSyncService.name);

  constructor(
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly merchantApi: MerchantApiService,
  ) {}

  async run(syncJobId: string): Promise<void> {
    const syncJob = await this.getSyncJob(syncJobId);
    const integration = await this.getIntegration(syncJob.integrationAccountId);

    if (!integration.externalAccountId) {
      throw new BadRequestException('Merchant integration is missing external_account_id');
    }

    await this.db
      .update(syncJobs)
      .set({ state: 'running', startedAt: new Date(), errorJson: null })
      .where(eq(syncJobs.id, syncJobId));

    try {
      const merchantProducts = await this.merchantApi.listProducts(integration.externalAccountId);
      let syncedListings = 0;
      let issueCount = 0;

      for (const merchantProduct of merchantProducts) {
        const variantId = await this.findLocalVariantId(integration.workspaceId, merchantProduct);
        if (!variantId) {
          this.logger.warn(
            `Skipping Merchant product without local variant match: ${this.getListingId(merchantProduct)}`,
          );
          continue;
        }

        await this.upsertChannelListing(integration, variantId, merchantProduct);
        issueCount += await this.upsertAlerts(integration, merchantProduct);
        syncedListings += 1;
      }

      await this.db
        .update(syncJobs)
        .set({
          state: 'done',
          payloadJson: {
            merchant_product_count: merchantProducts.length,
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

    if (syncJob.jobType !== 'merchant_initial_sync') {
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

    if (integration.platform !== 'merchant') {
      throw new BadRequestException('Sync job integration account is not Google Merchant');
    }

    return integration;
  }

  private async findLocalVariantId(
    workspaceId: string,
    merchantProduct: MerchantProduct,
  ): Promise<string | null> {
    const candidates = this.getSkuCandidates(merchantProduct);

    for (const sku of candidates) {
      const [match] = await this.db
        .select({ id: variants.id })
        .from(variants)
        .innerJoin(products, eq(variants.productId, products.id))
        .where(and(eq(products.workspaceId, workspaceId), eq(variants.sku, sku)))
        .limit(1);

      if (match) {
        return match.id;
      }
    }

    return null;
  }

  private async upsertChannelListing(
    integration: IntegrationAccount,
    variantId: string,
    merchantProduct: MerchantProduct,
  ): Promise<void> {
    const listingId = this.getListingId(merchantProduct);
    const values = {
      variantId,
      integrationAccountId: integration.id,
      platformListingId: listingId,
      status: this.getListingStatus(merchantProduct),
      buyabilityStatus: this.getBuyabilityStatus(merchantProduct),
      issuesJson: merchantProduct.productStatus?.itemLevelIssues ?? [],
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
    merchantProduct: MerchantProduct,
  ): Promise<number> {
    const issues = merchantProduct.productStatus?.itemLevelIssues ?? [];
    const entityRef = this.getListingId(merchantProduct);

    if (issues.length === 0) {
      await this.db
        .update(alerts)
        .set({ status: 'resolved' })
        .where(
          and(
            eq(alerts.workspaceId, integration.workspaceId),
            eq(alerts.category, 'listing_issue'),
            eq(alerts.sourcePlatform, 'merchant'),
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
          eq(alerts.sourcePlatform, 'merchant'),
          eq(alerts.entityRef, entityRef),
          eq(alerts.status, 'open'),
        ),
      )
      .limit(1);

    const payload = {
      merchant_product_name: merchantProduct.name,
      offer_id: merchantProduct.offerId,
      title: merchantProduct.productAttributes?.title,
      issues,
    };

    if (existing) {
      await this.db.update(alerts).set({ payloadJson: payload }).where(eq(alerts.id, existing.id));
    } else {
      await this.db.insert(alerts).values({
        workspaceId: integration.workspaceId,
        severity: this.getAlertSeverity(issues),
        category: 'listing_issue',
        entityRef,
        sourcePlatform: 'merchant',
        payloadJson: payload,
        status: 'open',
      });
    }

    return issues.length;
  }

  private getSkuCandidates(merchantProduct: MerchantProduct): string[] {
    return [
      this.getCustomAttribute(merchantProduct, 'sku'),
      merchantProduct.offerId,
      this.getCustomAttribute(merchantProduct, 'merchant item id'),
    ]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value));
  }

  private getCustomAttribute(merchantProduct: MerchantProduct, name: string): string | undefined {
    return merchantProduct.customAttributes?.find((attr) => attr.name === name)?.value;
  }

  private getListingId(merchantProduct: MerchantProduct): string {
    return merchantProduct.name ?? merchantProduct.offerId ?? 'unknown-merchant-product';
  }

  private getListingStatus(merchantProduct: MerchantProduct): string {
    const destinationStatuses = merchantProduct.productStatus?.destinationStatuses ?? [];

    if (destinationStatuses.some((status) => status.disapprovedCountries?.length)) {
      return 'disapproved';
    }

    if (merchantProduct.productStatus?.itemLevelIssues?.length) {
      return 'issue';
    }

    if (destinationStatuses.some((status) => status.approvedCountries?.length)) {
      return 'published';
    }

    return 'unlisted';
  }

  private getBuyabilityStatus(merchantProduct: MerchantProduct): string | null {
    const approved = merchantProduct.productStatus?.destinationStatuses
      ?.filter((status) => status.approvedCountries?.length)
      .map((status) => status.reportingContext)
      .filter(Boolean);

    return approved?.length ? approved.join(',') : null;
  }

  private getAlertSeverity(issues: Array<Record<string, unknown>>): string {
    return issues.some((issue) => String(issue.severity ?? '').toLowerCase().includes('critical'))
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
