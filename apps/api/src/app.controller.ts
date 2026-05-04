import { BadRequestException, Body, Controller, Delete, Get, Inject, InternalServerErrorException, NotFoundException, Param, Patch, Post } from "@nestjs/common";
import { createHash } from "node:crypto";
import { ConfigService } from "@nestjs/config";
import { InjectQueue } from "@nestjs/bullmq";
import OpenAI from "openai";
import { aiRecommendations, alerts, channelListings, integrationAccounts, inventoryPositions, orderLineItems, orders, products, searchPerformance, syncJobs, variants } from "@sunday-stripe/db";
import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type { Queue } from "bullmq";
import { Redis } from "ioredis";
import type { Sql } from "postgres";
import type * as schema from "@sunday-stripe/db";
import { DATABASE_CONNECTION, DRIZZLE_DATABASE } from "./database/database.constants.js";
import { AmazonApiService } from "./amazon/amazon-api.service.js";
import { MerchantApiService, type MerchantProduct } from "./merchant/merchant-api.service.js";
import { decryptToken } from "./shopify/crypto.util.js";

type Db = PostgresJsDatabase<typeof schema>;

type AlertAction = {
  id: string;
  label: string;
  description: string;
  kind: "shopify_variant_price_update";
  disabled?: boolean;
  disabledReason?: string;
  params: {
    workspaceId: string;
    variantId: string;
    productId: string;
    price: string;
    currencyCode: string;
  };
};

const STATUS_PRIORITY: Record<string, number> = {
  disapproved: 4,
  issue: 3,
  unlisted: 2,
  published: 1,
};

function getVariantSize(optionValuesJson: unknown): string | null {
  if (!optionValuesJson || typeof optionValuesJson !== "object") {
    return null;
  }

  const selectedOptions = (optionValuesJson as { selectedOptions?: unknown }).selectedOptions;
  if (!Array.isArray(selectedOptions)) {
    return null;
  }

  const sizeOption = selectedOptions.find((option) => {
    if (!option || typeof option !== "object") {
      return false;
    }
    const name = (option as { name?: unknown }).name;
    return typeof name === "string" && name.toLowerCase().includes("size");
  });

  const value = (sizeOption as { value?: unknown } | undefined)?.value;
  return typeof value === "string" && value.trim() ? value : null;
}

function getVariantTitle(optionValuesJson: unknown, fallbackSku: string): string {
  if (!optionValuesJson || typeof optionValuesJson !== "object") {
    return fallbackSku;
  }

  const selectedOptions = (optionValuesJson as { selectedOptions?: unknown }).selectedOptions;
  if (!Array.isArray(selectedOptions) || selectedOptions.length === 0) {
    return fallbackSku;
  }

  const values = selectedOptions
    .map((option) => {
      if (!option || typeof option !== "object") return null;
      const name = (option as { name?: unknown }).name;
      const value = (option as { value?: unknown }).value;
      if (typeof value !== "string" || !value.trim()) return null;
      if (typeof name !== "string" || name.toLowerCase() === "title") return value;
      return `${name}: ${value}`;
    })
    .filter((value): value is string => Boolean(value));

  return values.length > 0 ? values.join(" / ") : fallbackSku;
}

@Controller()
export class AppController {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly sql: Sql,
    @Inject(DRIZZLE_DATABASE) private readonly db: Db,
    private readonly config: ConfigService,
    private readonly amazonApi: AmazonApiService,
    private readonly merchantApi: MerchantApiService,
    @InjectQueue("shopify-sync") private readonly shopifyQueue: Queue,
    @InjectQueue("shopify-orders-sync") private readonly shopifyOrdersQueue: Queue,
    @InjectQueue("merchant-sync") private readonly merchantQueue: Queue,
    @InjectQueue("gsc-sync") private readonly gscQueue: Queue,
    @InjectQueue("amazon-sync") private readonly amazonQueue: Queue,
  ) {}

  @Get("status")
  async status() {
    const postgresReachable = await this.isPostgresReachable();
    const redisReachable = await this.isRedisReachable();

    if (!postgresReachable || !redisReachable) {
      return {
        ok: false,
        integrations: []
      };
    }

    const integrations = await this.db.select().from(integrationAccounts);
    const integrationStatuses = await Promise.all(
      integrations.map(async (integration) => {
        const [
          [{ value: productCount }],
          [{ value: variantCount }],
          [{ value: pendingJobs }],
          [{ value: failedJobs }],
          [{ value: openAlerts }]
        ] = await Promise.all([
          this.db
            .select({ value: count() })
            .from(products)
            .where(eq(products.workspaceId, integration.workspaceId)),
          this.db
            .select({ value: count() })
            .from(variants)
            .innerJoin(products, eq(variants.productId, products.id))
            .where(eq(products.workspaceId, integration.workspaceId)),
          this.db
            .select({ value: count() })
            .from(syncJobs)
            .where(
              and(
                eq(syncJobs.integrationAccountId, integration.id),
                eq(syncJobs.state, "pending")
              )
            ),
          this.db
            .select({ value: count() })
            .from(syncJobs)
            .where(
              and(
                eq(syncJobs.integrationAccountId, integration.id),
                eq(syncJobs.state, "failed")
              )
            ),
          this.db
            .select({ value: count() })
            .from(alerts)
            .where(
              and(
                eq(alerts.workspaceId, integration.workspaceId),
                eq(alerts.sourcePlatform, integration.platform),
                eq(alerts.status, "open"),
              ),
            )
        ]);

        return {
          id: integration.id,
          platform: integration.platform,
          shop_domain: integration.shopDomain,
          status: integration.status,
          last_synced_at: integration.lastSyncedAt?.toISOString() ?? null,
          product_count: productCount,
          variant_count: variantCount,
          pending_jobs: pendingJobs,
          failed_jobs: failedJobs,
          open_alerts: openAlerts
        };
      })
    );

    return {
      ok: true,
      integrations: integrationStatuses
    };
  }

  @Get("connections")
  async connections() {
    const integrations = await this.db.select().from(integrationAccounts);
    const openAlertRows = await this.db
      .select({ platform: alerts.sourcePlatform, value: count() })
      .from(alerts)
      .where(eq(alerts.status, "open"))
      .groupBy(alerts.sourcePlatform);
    const openAlertsByPlatform = new Map(
      openAlertRows.map((row) => [row.platform ?? "", row.value]),
    );

    const activeByPlatform = new Map(
      integrations
        .filter((integration) => integration.status === "active")
        .map((integration) => [integration.platform, integration]),
    );

    const merchantCredentialsConfigured = Boolean(
      this.config.get<string>("GOOGLE_MERCHANT_CREDENTIALS_JSON") ||
        this.config.get<string>("GOOGLE_MERCHANT_CREDENTIALS"),
    );
    const gscTokenConfigured = Boolean(
      this.config.get<string>("GSC_TOKEN_JSON") || this.config.get<string>("GSC_TOKEN"),
    );
    const amazonSellerConfigured = Boolean(this.config.get<string>("AMAZON_SELLER_ID"));
    const openAiConfigured = Boolean(this.config.get<string>("OPENAI_API_KEY"));

    const shopify = activeByPlatform.get("shopify");
    const merchant = activeByPlatform.get("merchant");
    const searchConsole = activeByPlatform.get("search_console");
    const amazon = activeByPlatform.get("amazon_sp");

    return {
      integrations: [
        {
          key: "shopify",
          label: "Shopify",
          status: shopify ? "connected" : "missing",
          detail: shopify?.shopDomain ? `shop: ${shopify.shopDomain}` : "Shopify store not connected",
          lastSyncedAt: shopify?.lastSyncedAt?.toISOString() ?? null,
          openAlerts: openAlertsByPlatform.get("shopify") ?? 0,
          missingSteps: shopify ? [] : ["Add SHOPIFY_ACCESS_TOKEN and run initial sync"],
        },
        {
          key: "merchant",
          label: "Google Merchant Center",
          status: merchant ? (merchantCredentialsConfigured ? "connected" : "partial") : "missing",
          detail: merchant
            ? merchantCredentialsConfigured
              ? "Service account configured"
              : "Service account credentials missing"
            : "Merchant account not connected",
          lastSyncedAt: merchant?.lastSyncedAt?.toISOString() ?? null,
          openAlerts: openAlertsByPlatform.get("merchant") ?? 0,
          missingSteps: [
            merchant ? null : "Connect a Merchant Center account",
            merchantCredentialsConfigured ? null : "Add service account credentials",
          ].filter((step): step is string => Boolean(step)),
        },
        {
          key: "search_console",
          label: "Google Search Console",
          status: searchConsole ? (gscTokenConfigured ? "connected" : "partial") : "missing",
          detail: searchConsole
            ? gscTokenConfigured
              ? "OAuth token configured"
              : "OAuth token missing"
            : "Search Console property not connected",
          lastSyncedAt: searchConsole?.lastSyncedAt?.toISOString() ?? null,
          openAlerts: openAlertsByPlatform.get("search_console") ?? 0,
          missingSteps: [
            searchConsole ? null : "Connect a Search Console property",
            gscTokenConfigured ? null : "Add OAuth token credentials",
          ].filter((step): step is string => Boolean(step)),
        },
        {
          key: "amazon_sp",
          label: "Amazon",
          status: amazon ? (amazonSellerConfigured ? "connected" : "partial") : "missing",
          detail: amazon
            ? amazonSellerConfigured
              ? "Seller account configured"
              : "Seller account details missing"
            : "Amazon seller account not connected",
          lastSyncedAt: amazon?.lastSyncedAt?.toISOString() ?? null,
          openAlerts: openAlertsByPlatform.get("amazon_sp") ?? 0,
          missingSteps: [
            amazon ? null : "Connect an Amazon seller account",
            amazonSellerConfigured ? null : "Add seller account details",
          ].filter((step): step is string => Boolean(step)),
        },
        {
          key: "openai",
          label: "OpenAI",
          status: openAiConfigured ? "connected" : "missing",
          detail: openAiConfigured ? "API key configured" : "AI provider not configured",
          lastSyncedAt: null,
          openAlerts: 0,
          missingSteps: openAiConfigured ? [] : ["Add an AI provider API key"],
        },
      ],
    };
  }

  @Get("products")
  async listProducts() {
    const productRows = await this.db
      .select({
        id: products.id,
        title: products.title,
        canonicalSku: products.canonicalSku,
        brand: products.brand,
        updatedAt: products.updatedAt,
        variantCount: sql<number>`count(distinct ${variants.id})::int`,
        availableInventory: sql<number>`coalesce(sum(case when ${inventoryPositions.quantityName} = 'available' then ${inventoryPositions.quantityValue} else 0 end), 0)::int`,
        hasBarcode: sql<boolean>`bool_or(${variants.barcode} is not null and ${variants.barcode} != '')`,
        hasDescription: sql<boolean>`(${products.descriptionHtml} is not null and length(trim(${products.descriptionHtml})) > 10)`,
        gtinExempt: products.gtinExempt,
      })
      .from(products)
      .leftJoin(variants, eq(variants.productId, products.id))
      .leftJoin(inventoryPositions, eq(inventoryPositions.variantId, variants.id))
      .groupBy(products.id)
      .orderBy(desc(products.updatedAt))
      .limit(200);

    const listingRows = await this.db
      .selectDistinct({
        productId: products.id,
        platform: integrationAccounts.platform,
        status: channelListings.status,
      })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(products, eq(variants.productId, products.id))
      .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id));

    const amazonQualityRows = await this.db
      .select({
        productId: products.id,
        maxScore: sql<number>`max(${channelListings.qualityScore})::int`,
      })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(products, eq(variants.productId, products.id))
      .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
      .where(eq(integrationAccounts.platform, "amazon_sp"))
      .groupBy(products.id);

    const amazonQualityByProduct = new Map(amazonQualityRows.map((r) => [r.productId, r.maxScore]));

    const channelsByProduct = new Map<string, Map<string, string>>();
    for (const row of listingRows) {
      if (!channelsByProduct.has(row.productId)) {
        channelsByProduct.set(row.productId, new Map());
      }
      const platformMap = channelsByProduct.get(row.productId)!;
      const incoming = STATUS_PRIORITY[row.status ?? ""] ?? 0;
      const current = STATUS_PRIORITY[platformMap.get(row.platform) ?? ""] ?? 0;
      if (incoming > current) {
        platformMap.set(row.platform, row.status ?? "unlisted");
      }
    }

    return productRows.map((p) => {
      const missing: string[] = [];
      if (!p.title?.trim()) missing.push("title");
      if (!p.brand?.trim()) missing.push("brand");
      if (!p.hasBarcode && !p.gtinExempt) missing.push("barcode");
      if (!p.hasDescription) missing.push("description");

      return {
        id: p.id,
        title: p.title,
        canonicalSku: p.canonicalSku,
        updatedAt: p.updatedAt,
        variantCount: p.variantCount,
        availableInventory: p.availableInventory,
        missingAttributes: missing,
        amazonQualityScore: amazonQualityByProduct.get(p.id) ?? null,
        channels: Array.from((channelsByProduct.get(p.id) ?? new Map()).entries()).map(
          ([platform, status]) => ({ platform, status }),
        ),
      };
    });
  }

  @Get("products/:id/gsc")
  async getProductGsc(@Param("id") id: string) {
    const [product] = await this.db
      .select({ title: products.title, canonicalSku: products.canonicalSku, workspaceId: products.workspaceId })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const handle = this.titleToHandle(product.title ?? product.canonicalSku);

    const [pageRows, queryRows] = await Promise.all([
      this.db
        .select({
          url: searchPerformance.dimensionValue,
          clicks: searchPerformance.clicks,
          impressions: searchPerformance.impressions,
          ctr: searchPerformance.ctr,
          position: searchPerformance.position,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "page"),
            sql`${searchPerformance.dimensionValue} ilike ${`%/products/${handle}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(10),
      this.db
        .select({
          query: searchPerformance.dimensionValue,
          clicks: searchPerformance.clicks,
          impressions: searchPerformance.impressions,
          ctr: searchPerformance.ctr,
          position: searchPerformance.position,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "query"),
            sql`${searchPerformance.dimensionValue} ilike ${`%${handle.replace(/-/g, "%")}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(20),
    ]);

    return {
      handle,
      pages: pageRows.map((r) => ({
        url: r.url,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr / 1000,
        position: r.position / 10,
      })),
      queries: queryRows.map((r) => ({
        query: r.query,
        clicks: r.clicks,
        impressions: r.impressions,
        ctr: r.ctr / 1000,
        position: r.position / 10,
      })),
    };
  }

  @Get("amazon/unmatched")
  async getUnmatchedAmazonListings() {
    const localSkuRows = await this.db
      .select({ sku: variants.sku })
      .from(variants)
      .innerJoin(products, eq(variants.productId, products.id));
    const localSkus = new Set(localSkuRows.map((row) => row.sku));

    const items: Array<{
      sku: string;
      asin: string | null;
      title: string | null;
      status: string;
      productType: string | null;
      imageUrl: string | null;
    }> = [];
    const seenSkus = new Set<string>();
    const seenTokens = new Set<string>();
    let pageToken: string | undefined;
    let fetchedListings = 0;

    for (let page = 0; page < 25; page += 1) {
      const { items: pageItems, nextToken } = await this.amazonApi.fetchListingsPage(pageToken);
      fetchedListings += pageItems.length;

      for (const listing of pageItems) {
        if (!listing.sku || localSkus.has(listing.sku) || seenSkus.has(listing.sku)) continue;
        seenSkus.add(listing.sku);
        items.push({
          sku: listing.sku,
          asin: listing.asin,
          title: listing.title,
          status: listing.status,
          productType: listing.productType,
          imageUrl: listing.imageUrl,
        });
      }

      if (!nextToken || seenTokens.has(nextToken)) break;
      seenTokens.add(nextToken);
      pageToken = nextToken;
    }

    return {
      fetchedListings,
      unmatchedCount: items.length,
      items,
    };
  }

  @Post("amazon/import-listing")
  async importAmazonListing(
    @Body()
    body: {
      sku: string;
      asin?: string | null;
      title?: string | null;
      status?: string | null;
      productType?: string | null;
    },
  ) {
    const sku = body.sku?.trim();
    if (!sku) throw new BadRequestException("Amazon seller SKU is required");

    const [existingVariant] = await this.db
      .select({ id: variants.id, productId: variants.productId })
      .from(variants)
      .where(eq(variants.sku, sku))
      .limit(1);

    if (existingVariant) {
      throw new BadRequestException("A local variant already uses this seller SKU");
    }

    const [integration] = await this.db
      .select({ id: integrationAccounts.id, workspaceId: integrationAccounts.workspaceId })
      .from(integrationAccounts)
      .where(and(eq(integrationAccounts.platform, "amazon_sp"), eq(integrationAccounts.status, "active")))
      .limit(1);

    if (!integration) throw new BadRequestException("No active Amazon integration found");

    const title = body.title?.trim() || sku;
    const now = new Date();
    const [product] = await this.db
      .insert(products)
      .values({
        workspaceId: integration.workspaceId,
        canonicalSku: sku,
        title,
        sourceOfTruth: "amazon_sp",
        sourceUpdatedAt: now,
        updatedAt: now,
      })
      .returning({ id: products.id });

    const [variant] = await this.db
      .insert(variants)
      .values({
        productId: product.id,
        sku,
        optionValuesJson: body.productType ? { source: "amazon_sp", productType: body.productType } : { source: "amazon_sp" },
        updatedAt: now,
      })
      .returning({ id: variants.id });

    const listingStatus = this.getAmazonListingStatus(body.status ?? "UNKNOWN");
    await this.db.insert(channelListings).values({
      variantId: variant.id,
      integrationAccountId: integration.id,
      platformListingId: body.asin ?? sku,
      status: listingStatus,
      buyabilityStatus: body.status ?? "UNKNOWN",
      lastSeenAt: now,
      updatedAt: now,
    });

    return { ok: true, productId: product.id, variantId: variant.id };
  }

  @Get("products/:id")
  async getProduct(@Param("id") id: string) {
    const [product] = await this.db
      .select()
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const variantRows = await this.db
      .select()
      .from(variants)
      .where(eq(variants.productId, id))
      .orderBy(variants.sku);

    const variantIds = variantRows.map((v) => v.id);

    const [listingRows, inventoryRows] = await Promise.all([
      variantIds.length > 0
        ? this.db
            .select({
              variantId: channelListings.variantId,
              platform: integrationAccounts.platform,
              status: channelListings.status,
              buyabilityStatus: channelListings.buyabilityStatus,
              issuesJson: channelListings.issuesJson,
              qualityScore: channelListings.qualityScore,
              platformListingId: channelListings.platformListingId,
            })
            .from(channelListings)
            .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
            .where(inArray(channelListings.variantId, variantIds))
        : Promise.resolve([]),
      variantIds.length > 0
        ? this.db
            .select()
            .from(inventoryPositions)
            .where(inArray(inventoryPositions.variantId, variantIds))
            .orderBy(inventoryPositions.locationKey, inventoryPositions.quantityName)
        : Promise.resolve([]),
    ]);

    const platformListingIds = [
      ...new Set(
        listingRows
          .map((l) => l.platformListingId)
          .filter((pid): pid is string => Boolean(pid)),
      ),
    ];

    const alertRows =
      platformListingIds.length > 0
        ? await this.db
            .select()
            .from(alerts)
            .where(
              and(
                eq(alerts.workspaceId, product.workspaceId),
                eq(alerts.status, "open"),
                inArray(alerts.entityRef, platformListingIds),
              ),
            )
            .orderBy(desc(alerts.createdAt))
        : [];

    const listingsByVariant = new Map<string, typeof listingRows>();
    for (const row of listingRows) {
      const bucket = listingsByVariant.get(row.variantId) ?? [];
      bucket.push(row);
      listingsByVariant.set(row.variantId, bucket);
    }

    const inventoryByVariant = new Map<string, Map<string, { name: string; value: number }[]>>();
    for (const row of inventoryRows) {
      if (!inventoryByVariant.has(row.variantId)) {
        inventoryByVariant.set(row.variantId, new Map());
      }
      const locMap = inventoryByVariant.get(row.variantId)!;
      const bucket = locMap.get(row.locationKey) ?? [];
      bucket.push({ name: row.quantityName, value: row.quantityValue });
      locMap.set(row.locationKey, bucket);
    }

    return {
      product: {
        id: product.id,
        title: product.title,
        canonicalSku: product.canonicalSku,
        brand: product.brand,
        descriptionHtml: product.descriptionHtml,
        seoTitle: product.seoTitle ?? null,
        seoDescription: product.seoDescription ?? null,
        sourceOfTruth: product.sourceOfTruth,
        sourceUpdatedAt: product.sourceUpdatedAt?.toISOString() ?? null,
        updatedAt: product.updatedAt?.toISOString() ?? null,
      },
      variants: variantRows.map((v) => ({
        id: v.id,
        sku: v.sku,
        title: getVariantTitle(v.optionValuesJson, v.sku),
        barcode: v.barcode,
        size: getVariantSize(v.optionValuesJson),
        optionValuesJson: v.optionValuesJson,
        listings: listingsByVariant.get(v.id) ?? [],
        inventory: Array.from((inventoryByVariant.get(v.id) ?? new Map()).entries()).map(
          ([locationKey, quantities]) => ({ locationKey, quantities }),
        ),
      })),
      alerts: alertRows,
    };
  }

  @Get("inventory")
  async getInventory() {
    const variantRows = await this.db
      .select({
        productId: products.id,
        title: products.title,
        canonicalSku: products.canonicalSku,
        variantId: variants.id,
        sku: variants.sku,
        barcode: variants.barcode,
        optionValuesJson: variants.optionValuesJson,
      })
      .from(variants)
      .innerJoin(products, eq(variants.productId, products.id))
      .orderBy(products.title, variants.sku)
      .limit(1000);

    if (variantRows.length === 0) {
      return {
        periodDays: 90,
        totals: {
          productCount: 0,
          variantCount: 0,
          totalAvailable: 0,
          totalOnHand: 0,
          totalCommitted: 0,
          totalIncoming: 0,
          unitsSold: 0,
          revenueCents: 0,
          lowStockCount: 0,
          stockRiskCount: 0,
          outOfStockCount: 0,
        },
        locations: [],
        variants: [],
      };
    }

    const variantIds = variantRows.map((row) => row.variantId);
    const [inventoryRows, revenueRows] = await Promise.all([
      this.db
        .select({
          variantId: inventoryPositions.variantId,
          locationKey: inventoryPositions.locationKey,
          quantityName: inventoryPositions.quantityName,
          quantityValue: inventoryPositions.quantityValue,
          updatedAt: inventoryPositions.updatedAt,
        })
        .from(inventoryPositions)
        .where(inArray(inventoryPositions.variantId, variantIds))
        .orderBy(inventoryPositions.locationKey, inventoryPositions.quantityName),
      this.db
        .select({
          variantId: orderLineItems.variantId,
          unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
        })
        .from(orderLineItems)
        .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
        .where(
          and(
            sql`${orders.createdAt} > now() - interval '90 days'`,
            sql`${orderLineItems.variantId} is not null`,
          ),
        )
        .groupBy(orderLineItems.variantId),
    ]);

    const revenueByVariant = new Map(
      revenueRows
        .filter((row): row is typeof row & { variantId: string } => Boolean(row.variantId))
        .map((row) => [row.variantId, row]),
    );

    const quantityByVariant = new Map<string, Map<string, Map<string, number>>>();
    const updatedByVariant = new Map<string, Date>();
    for (const row of inventoryRows) {
      if (!quantityByVariant.has(row.variantId)) {
        quantityByVariant.set(row.variantId, new Map());
      }
      const byLocation = quantityByVariant.get(row.variantId)!;
      if (!byLocation.has(row.locationKey)) {
        byLocation.set(row.locationKey, new Map());
      }
      byLocation.get(row.locationKey)!.set(row.quantityName, row.quantityValue);
      const current = updatedByVariant.get(row.variantId);
      if (!current || row.updatedAt > current) {
        updatedByVariant.set(row.variantId, row.updatedAt);
      }
    }

    const locations = new Map<string, { available: number; onHand: number; committed: number; incoming: number }>();
    const totals = {
      productCount: new Set(variantRows.map((row) => row.productId)).size,
      variantCount: variantRows.length,
      totalAvailable: 0,
      totalOnHand: 0,
      totalCommitted: 0,
      totalIncoming: 0,
      unitsSold: 0,
      revenueCents: 0,
      lowStockCount: 0,
      stockRiskCount: 0,
      outOfStockCount: 0,
    };

    const variantsPayload = variantRows.map((row) => {
      const locationMap = quantityByVariant.get(row.variantId) ?? new Map();
      const variantLocations = Array.from(locationMap.entries()).map(([locationKey, quantities]) => {
        const available = quantities.get("available") ?? 0;
        const onHand = quantities.get("on_hand") ?? 0;
        const committed = quantities.get("committed") ?? 0;
        const incoming = quantities.get("incoming") ?? 0;
        const aggregate = locations.get(locationKey) ?? { available: 0, onHand: 0, committed: 0, incoming: 0 };
        aggregate.available += available;
        aggregate.onHand += onHand;
        aggregate.committed += committed;
        aggregate.incoming += incoming;
        locations.set(locationKey, aggregate);
        return { locationKey, available, onHand, committed, incoming };
      });

      const available = variantLocations.reduce((sum, location) => sum + location.available, 0);
      const onHand = variantLocations.reduce((sum, location) => sum + location.onHand, 0);
      const committed = variantLocations.reduce((sum, location) => sum + location.committed, 0);
      const incoming = variantLocations.reduce((sum, location) => sum + location.incoming, 0);
      const revenue = revenueByVariant.get(row.variantId);
      const unitsSold = revenue?.unitsSold ?? 0;
      const revenueCents = revenue?.revenueCents ?? 0;
      const dailyVelocity = unitsSold > 0 ? unitsSold / 90 : 0;
      const daysOfCover = dailyVelocity > 0 ? Math.round((available / dailyVelocity) * 10) / 10 : null;
      const status =
        available <= 0
          ? "out_of_stock"
          : unitsSold > 0 && daysOfCover !== null && daysOfCover <= 14
            ? "stock_risk"
            : available <= 5
              ? "low_stock"
              : "ok";

      totals.totalAvailable += available;
      totals.totalOnHand += onHand;
      totals.totalCommitted += committed;
      totals.totalIncoming += incoming;
      totals.unitsSold += unitsSold;
      totals.revenueCents += revenueCents;
      if (status === "out_of_stock") totals.outOfStockCount += 1;
      if (status === "low_stock") totals.lowStockCount += 1;
      if (status === "stock_risk") totals.stockRiskCount += 1;

      return {
        productId: row.productId,
        title: row.title,
        canonicalSku: row.canonicalSku,
        variantId: row.variantId,
        sku: row.sku,
        barcode: row.barcode,
        size: getVariantSize(row.optionValuesJson),
        available,
        onHand,
        committed,
        incoming,
        unitsSold,
        revenueCents,
        dailyVelocity: Math.round(dailyVelocity * 100) / 100,
        daysOfCover,
        status,
        updatedAt: updatedByVariant.get(row.variantId)?.toISOString() ?? null,
        locations: variantLocations,
      };
    });

    const riskPriority: Record<string, number> = {
      out_of_stock: 0,
      stock_risk: 1,
      low_stock: 2,
      ok: 3,
    };

    // Resolve location GIDs to names from Shopify
    let locationNameMap: Record<string, string> = {};
    try {
      const account = await this.getShopifyAccount();
      const accessToken = decryptToken(account.encryptedAccessToken!);
      const locData = await this.shopifyGraphql<{
        locations: { nodes: Array<{ id: string; name: string }> };
      }>(
        account.shopDomain!,
        accessToken,
        `#graphql query GetLocations { locations(first: 30, includeInactive: true) { nodes { id name } } }`,
        {},
      );
      locationNameMap = Object.fromEntries(
        locData.locations.nodes.map((loc) => [loc.id, loc.name]),
      );
    } catch { /* non-fatal — fall back to formatted GID */ }

    const resolveLocationName = (key: string): string => {
      if (locationNameMap[key]) return locationNameMap[key];
      const numericId = key.split("/").pop();
      if (numericId && locationNameMap[`gid://shopify/Location/${numericId}`]) {
        return locationNameMap[`gid://shopify/Location/${numericId}`];
      }
      return numericId ? `Location ${numericId}` : key;
    };

    return {
      periodDays: 90,
      totals,
      locations: Array.from(locations.entries())
        .map(([locationKey, values]) => ({ locationKey, name: resolveLocationName(locationKey), ...values }))
        .sort((a, b) => b.available - a.available),
      variants: variantsPayload
        .map((v) => ({
          ...v,
          locations: v.locations.map((loc) => ({ ...loc, name: resolveLocationName(loc.locationKey) })),
        }))
        .sort((a, b) => {
          const statusDelta = riskPriority[a.status] - riskPriority[b.status];
          return statusDelta || b.revenueCents - a.revenueCents || a.sku.localeCompare(b.sku);
        }),
    };
  }

  @Get("locations")
  async listLocations() {
    const account = await this.getShopifyAccount();
    const accessToken = decryptToken(account.encryptedAccessToken!);
    const data = await this.shopifyGraphql<{
      locations: { nodes: Array<{ id: string; name: string; isActive: boolean; address: { city: string | null; countryCode: string | null } }> };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        query GetLocations {
          locations(first: 30, includeInactive: true) {
            nodes { id name isActive address { city countryCode } }
          }
        }
      `,
      {},
    );
    return data.locations.nodes.map((loc) => ({
      id: loc.id,
      numericId: loc.id.split("/").pop() ?? loc.id,
      name: loc.name,
      isActive: loc.isActive,
      city: loc.address.city,
      countryCode: loc.address.countryCode,
    }));
  }

  @Get("alerts")
  async listAlerts() {
    return this.db
      .select({
        id: alerts.id,
        severity: alerts.severity,
        category: alerts.category,
        sourcePlatform: alerts.sourcePlatform,
        entityRef: alerts.entityRef,
        payloadJson: alerts.payloadJson,
        status: alerts.status,
        createdAt: alerts.createdAt,
      })
      .from(alerts)
      .where(eq(alerts.status, "open"))
      .orderBy(desc(alerts.createdAt))
      .limit(200);
  }

  @Get("search-console/summary")
  async gscSummary() {
    const rows = await this.db
      .select({
        clicks: searchPerformance.clicks,
        impressions: searchPerformance.impressions,
        ctr: searchPerformance.ctr,
        position: searchPerformance.position,
      })
      .from(searchPerformance)
      .where(eq(searchPerformance.dimension, "page"));

    const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
    const totalImpressions = rows.reduce((s, r) => s + r.impressions, 0);
    const weightedCtr = rows.reduce((s, r) => s + r.ctr * r.impressions, 0);
    const weightedPos = rows.reduce((s, r) => s + r.position * r.impressions, 0);
    const totalImp = totalImpressions || 1;

    return {
      clicks: totalClicks,
      impressions: totalImpressions,
      ctr: Math.round(weightedCtr / totalImp) / 1000,
      position: Math.round(weightedPos / totalImp) / 10,
      row_count: rows.length,
    };
  }

  @Get("search-console/queries")
  async gscQueries() {
    const rows = await this.db
      .select({
        query: searchPerformance.dimensionValue,
        clicks: searchPerformance.clicks,
        impressions: searchPerformance.impressions,
        ctr: searchPerformance.ctr,
        position: searchPerformance.position,
      })
      .from(searchPerformance)
      .where(eq(searchPerformance.dimension, "query"))
      .orderBy(desc(searchPerformance.impressions))
      .limit(100);

    return rows.map((r) => ({
      query: r.query,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr / 1000,
      position: r.position / 10,
    }));
  }

  @Get("search-console/pages")
  async gscPages() {
    const rows = await this.db
      .select({
        url: searchPerformance.dimensionValue,
        clicks: searchPerformance.clicks,
        impressions: searchPerformance.impressions,
        ctr: searchPerformance.ctr,
        position: searchPerformance.position,
      })
      .from(searchPerformance)
      .where(eq(searchPerformance.dimension, "page"))
      .orderBy(desc(searchPerformance.impressions))
      .limit(100);

    return rows.map((r) => ({
      url: r.url,
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r.ctr / 1000,
      position: r.position / 10,
    }));
  }

  @Get("revenue")
  async getRevenue() {
    return this.db
      .select({
        productId: products.id,
        title: products.title,
        canonicalSku: products.canonicalSku,
        unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
        revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
      })
      .from(orderLineItems)
      .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
      .innerJoin(products, eq(orderLineItems.productId, products.id))
      .where(sql`${orders.createdAt} > now() - interval '90 days'`)
      .groupBy(products.id, products.title, products.canonicalSku)
      .orderBy(desc(sql`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)`))
      .limit(100);
  }

  @Get("cross-channel")
  async getCrossChannel() {
    const productRows = await this.db
      .select({
        id: products.id,
        workspaceId: products.workspaceId,
        title: products.title,
        canonicalSku: products.canonicalSku,
        brand: products.brand,
      })
      .from(products)
      .orderBy(products.title)
      .limit(500);

    if (productRows.length === 0) {
      return [];
    }

    const workspaceId = productRows[0].workspaceId;
    const [revenueRows, channelRows, gscRows, amazonQualityRows] = await Promise.all([
      this.db
        .select({
          productId: orderLineItems.productId,
          unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
        })
        .from(orderLineItems)
        .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
        .where(sql`${orders.createdAt} > now() - interval '90 days' and ${orderLineItems.productId} is not null`)
        .groupBy(orderLineItems.productId),
      this.db
        .selectDistinct({
          productId: variants.productId,
          platform: integrationAccounts.platform,
        })
        .from(channelListings)
        .innerJoin(variants, eq(channelListings.variantId, variants.id))
        .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id)),
      this.db
        .select({
          dimensionValue: searchPerformance.dimensionValue,
          clicks: sql<number>`coalesce(sum(${searchPerformance.clicks}), 0)::int`,
          impressions: sql<number>`coalesce(sum(${searchPerformance.impressions}), 0)::int`,
          positionTenths: sql<number>`avg(${searchPerformance.position})::float`,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, workspaceId),
            eq(searchPerformance.dimension, "page"),
          ),
        )
        .groupBy(searchPerformance.dimensionValue),
      this.db
        .select({
          productId: products.id,
          maxScore: sql<number>`max(${channelListings.qualityScore})::int`,
        })
        .from(channelListings)
        .innerJoin(variants, eq(channelListings.variantId, variants.id))
        .innerJoin(products, eq(variants.productId, products.id))
        .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
        .where(eq(integrationAccounts.platform, "amazon_sp"))
        .groupBy(products.id),
    ]);

    const revenueByProduct = new Map(
      revenueRows
        .filter((row): row is typeof row & { productId: string } => Boolean(row.productId))
        .map((row) => [row.productId, row]),
    );

    const channelsByProduct = new Map<string, Set<string>>();
    for (const row of channelRows) {
      const platforms = channelsByProduct.get(row.productId) ?? new Set<string>();
      platforms.add(row.platform);
      channelsByProduct.set(row.productId, platforms);
    }

    const amazonQualityByProduct = new Map(
      amazonQualityRows.map((row) => [row.productId, row.maxScore]),
    );

    const flagPriority: Record<string, number> = {
      no_revenue: 0,
      opportunity: 1,
      no_listing: 2,
      ok: 3,
    };

    return productRows
      .map((product) => {
        const revenue = revenueByProduct.get(product.id);
        const channels = Array.from(channelsByProduct.get(product.id) ?? []).sort();
        const handle = this.titleToHandle(product.title ?? product.canonicalSku);
        const matchingGscRows = gscRows.filter((row) =>
          row.dimensionValue.includes(`/products/${handle}`),
        );
        const gscClicks = matchingGscRows.reduce((total, row) => total + row.clicks, 0);
        const gscImpressions = matchingGscRows.reduce(
          (total, row) => total + row.impressions,
          0,
        );
        const weightedPosition = matchingGscRows.reduce(
          (total, row) => total + row.positionTenths * row.impressions,
          0,
        );
        const gscPosition =
          gscImpressions > 0 ? Math.round((weightedPosition / gscImpressions) / 10 * 10) / 10 : null;
        const revenueCents = revenue?.revenueCents ?? 0;
        const unitsSold = revenue?.unitsSold ?? 0;
        const flag =
          gscImpressions >= 100 && revenueCents === 0
            ? "no_revenue"
            : revenueCents > 0 && !channels.includes("amazon_sp")
              ? "opportunity"
              : revenueCents > 0 && !channels.includes("merchant")
                ? "no_listing"
                : "ok";

        return {
          productId: product.id,
          title: product.title,
          canonicalSku: product.canonicalSku,
          revenueCents,
          unitsSold,
          gscImpressions,
          gscClicks,
          gscPosition,
          channels,
          amazonQualityScore: amazonQualityByProduct.get(product.id) ?? null,
          flag,
        };
      })
      .sort((a, b) => {
        const flagDelta = flagPriority[a.flag] - flagPriority[b.flag];
        return flagDelta || b.revenueCents - a.revenueCents;
      })
      .slice(0, 200);
  }

  @Get("products/:id/revenue")
  async getProductRevenue(@Param("id") id: string) {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const variantRows = await this.db
      .select({
        variantId: orderLineItems.variantId,
        sku: orderLineItems.sku,
        unitsSold: sql<number>`sum(${orderLineItems.quantity})::int`,
        revenueCents: sql<number>`sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents})::int`,
      })
      .from(orderLineItems)
      .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
      .where(
        and(
          eq(orderLineItems.productId, id),
          sql`${orders.createdAt} > now() - interval '90 days'`,
        ),
      )
      .groupBy(orderLineItems.variantId, orderLineItems.sku)
      .orderBy(desc(sql`sum(${orderLineItems.quantity})`))
      .limit(10);

    const totalUnitsSold = variantRows.reduce((s, r) => s + r.unitsSold, 0);
    const totalRevenueCents = variantRows.reduce((s, r) => s + r.revenueCents, 0);

    // Enrich with size from variants table
    const variantIds = variantRows.map((r) => r.variantId).filter((v): v is string => Boolean(v));
    const variantDetails = variantIds.length > 0
      ? await this.db.select({ id: variants.id, optionValuesJson: variants.optionValuesJson }).from(variants).where(inArray(variants.id, variantIds))
      : [];
    const sizeByVariantId = new Map(variantDetails.map((v) => [v.id, getVariantSize(v.optionValuesJson)]));

    return {
      periodDays: 90,
      unitsSold: totalUnitsSold,
      revenueCents: totalRevenueCents,
      topVariants: variantRows.map((r) => ({
        sku: r.sku,
        size: r.variantId ? (sizeByVariantId.get(r.variantId) ?? null) : null,
        unitsSold: r.unitsSold,
        revenueCents: r.revenueCents,
      })),
    };
  }

  @Post("ai/describe-product")
  async aiDescribeProduct(@Body() body: { productId: string }) {
    const [product] = await this.db
      .select({
        title: products.title,
        brand: products.brand,
        canonicalSku: products.canonicalSku,
        descriptionHtml: products.descriptionHtml,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
        workspaceId: products.workspaceId,
      })
      .from(products)
      .where(eq(products.id, body.productId))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${body.productId} not found`);

    const handle = this.titleToHandle(product.title ?? product.canonicalSku);
    const gscQueries = await this.db
      .select({ query: searchPerformance.dimensionValue, impressions: searchPerformance.impressions })
      .from(searchPerformance)
      .where(
        and(
          eq(searchPerformance.workspaceId, product.workspaceId),
          eq(searchPerformance.dimension, "query"),
          sql`${searchPerformance.dimensionValue} ilike ${`%${handle.replace(/-/g, "%")}%`}`,
        ),
      )
      .orderBy(desc(searchPerformance.impressions))
      .limit(10);

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey });

    const prompt = [
      `Product title: ${product.title ?? product.canonicalSku}`,
      product.brand ? `Brand: ${product.brand}` : null,
      `SKU: ${product.canonicalSku}`,
      product.descriptionHtml ? `Existing description (HTML): ${product.descriptionHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 500)}` : "No existing description.",
      product.seoTitle ? `Current SEO title: ${product.seoTitle}` : null,
      product.seoDescription ? `Current SEO meta description: ${product.seoDescription}` : null,
      gscQueries.length > 0 ? `Top search queries driving traffic to this product: ${gscQueries.map((q) => q.query).join(", ")}` : null,
    ].filter(Boolean).join("\n");

    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an e-commerce copywriter. Given product data, write a compelling product description (2–3 short paragraphs, no HTML), an SEO title (under 60 characters), and an SEO meta description (under 160 characters). Incorporate any search queries naturally. Respond as JSON with keys: description, seoTitle, seoMetaDescription.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 600,
    });
    return this.parseAiJson<{ description: string; seoTitle: string; seoMetaDescription: string }>(raw);
  }

  @Post("ai/explain-alert")
  async aiExplainAlert(@Body() body: { alertId: string }) {
    const [alert] = await this.db
      .select()
      .from(alerts)
      .where(eq(alerts.id, body.alertId))
      .limit(1);

    if (!alert) throw new NotFoundException(`Alert ${body.alertId} not found`);

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey });

    const payload = alert.payloadJson as Record<string, unknown> | null;
    const issues = Array.isArray(payload?.["issues"]) ? (payload["issues"] as unknown[]) : [];
    const live = await this.getAlertLiveContext(alert, payload);
    const issueDocumentation = issues
      .map((issue) => {
        if (!issue || typeof issue !== "object") return null;
        const documentation = (issue as { documentation?: unknown }).documentation;
        return typeof documentation === "string" ? documentation : null;
      })
      .filter((url): url is string => Boolean(url));
    const offerId = typeof payload?.["offer_id"] === "string" ? payload["offer_id"] : null;
    const merchantProductName =
      typeof payload?.["merchant_product_name"] === "string" ? payload["merchant_product_name"] : null;
    const entityRefs = [alert.entityRef, offerId, merchantProductName].filter(
      (value): value is string => Boolean(value),
    );
    const [productMatch] = await this.db
      .select({
        id: products.id,
        title: products.title,
        canonicalSku: products.canonicalSku,
      })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(products, eq(variants.productId, products.id))
      .where(
        or(
          entityRefs.length > 0 ? inArray(channelListings.platformListingId, entityRefs) : undefined,
          offerId ? ilike(channelListings.platformListingId, `%${offerId}%`) : undefined,
        ),
      )
      .limit(1);

    const links = [
      productMatch
        ? {
            label: "Open product workspace",
            href: `/products/${productMatch.id}`,
            description: `Review listings, variants, inventory, and AI fixes for ${productMatch.title ?? productMatch.canonicalSku}.`,
          }
        : {
            label: "Find product",
            href: `/products${entityRefs[0] ? `?query=${encodeURIComponent(entityRefs[0])}` : ""}`,
            description: "Search the product catalog for the affected offer or SKU.",
          },
      alert.sourcePlatform === "merchant"
        ? {
            label: "Review Merchant listings",
            href: "/products?gap=merchant",
            description: "Filter products with Merchant issues and confirm the feed data after changes sync.",
          }
        : null,
      alert.sourcePlatform === "amazon_sp"
        ? {
            label: "Review Amazon listings",
            href: "/products?gap=amazon_sp",
            description: "Check Amazon listing quality, buyability, and channel status for affected products.",
          }
        : null,
      {
        label: "Run sync from Operations",
        href: "/operations",
        description: "After fixing the product data, trigger the channel sync and confirm the alert clears.",
      },
      issueDocumentation[0]
        ? {
            label: "Issue reference",
            href: issueDocumentation[0],
            description: "Vendor documentation for this exact alert type.",
          }
        : null,
    ].filter((link): link is { label: string; href: string; description: string } => Boolean(link));

    const prompt = [
      `Platform: ${alert.sourcePlatform ?? "unknown"}`,
      `Alert category: ${alert.category}`,
      `Severity: ${alert.severity}`,
      payload?.["offer_id"] ? `Offer ID: ${payload["offer_id"]}` : null,
      payload?.["title"] ? `Product title: ${payload["title"]}` : null,
      live ? `Live Shopify price: ${live.shopifyVariant?.price ?? "unknown"} ${live.shopifyVariant?.currencyCode ?? ""}` : null,
      live ? `Live Google Merchant price: ${live.merchantProduct?.price ?? "unknown"} ${live.merchantProduct?.currencyCode ?? ""}` : null,
      live?.priceComparison ? `Live price comparison: ${live.priceComparison.status}` : null,
      issues.length > 0 ? `Issues:\n${JSON.stringify(issues, null, 2)}` : null,
    ].filter(Boolean).join("\n");

    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a commerce operations expert. Given a channel alert from Google Merchant Center or Amazon, explain in plain English what the problem is and provide 2–4 specific, actionable steps to fix it in the merchant's store/channel data. Be concise and direct. Respond as JSON with keys: summary (1–2 sentences), fixes (array of strings). Do not include links.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    const result = this.parseAiJson<{ summary?: string; fixes?: string[] }>(raw);
    return {
      summary: result.summary ?? "This alert needs a product or channel data fix before the channel can fully trust the listing.",
      fixes: Array.isArray(result.fixes) ? result.fixes : [],
      links,
      live,
    };
  }

  @Post("ai/triage-alerts")
  async aiTriageAlerts() {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");

    const alertRows = await this.db
      .select({
        id: alerts.id,
        severity: alerts.severity,
        category: alerts.category,
        sourcePlatform: alerts.sourcePlatform,
        entityRef: alerts.entityRef,
        payloadJson: alerts.payloadJson,
        workspaceId: alerts.workspaceId,
      })
      .from(alerts)
      .where(eq(alerts.status, "open"))
      .orderBy(desc(alerts.createdAt))
      .limit(100);

    if (alertRows.length === 0) {
      return { groups: [], summary: "No open alerts to triage.", cached: false };
    }

    const workspaceId = alertRows[0].workspaceId;
    const serialized = alertRows.map((alert) => {
      const p = alert.payloadJson as Record<string, unknown> | null;
      const issues = Array.isArray(p?.["issues"]) ? (p["issues"] as Array<Record<string, unknown>>) : [];
      const issueCodes = issues.map((issue) => issue["code"] ?? issue["attribute"] ?? "").filter(Boolean).join(", ");
      return [
        `id:${alert.id}`,
        `platform:${alert.sourcePlatform ?? "unknown"}`,
        `category:${alert.category}`,
        `severity:${alert.severity}`,
        alert.entityRef ? `entity:${alert.entityRef}` : null,
        issueCodes ? `issues:${issueCodes}` : null,
        p?.["topic"] ? `topic:${p["topic"]}` : null,
        p?.["error"] ? `error:${String(p["error"]).slice(0, 80)}` : null,
      ].filter(Boolean).join(" | ");
    }).join("\n");

    const contextHash = this.hashContext({ serialized });
    const cached = await this.getCachedRecommendation<object>(workspaceId, "triage_alerts", null, contextHash);
    if (cached) return { ...cached, cached: true };

    const openai = new OpenAI({ apiKey });
    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `You are a commerce operations analyst. Given a list of open alerts from an e-commerce hub (Shopify, Google Merchant Center, Amazon), group them by root cause, prioritize by impact, and return a triage plan.

Return JSON only with this exact shape:
{
  "summary": "1-2 sentence overview of the alert landscape",
  "groups": [
    {
      "id": "short_snake_case_key",
      "title": "Short group title",
      "platform": "shopify|merchant|amazon_sp|mixed",
      "priority": "critical|high|medium|low",
      "alertIds": ["id1", "id2"],
      "rootCause": "1 sentence root cause",
      "recommendedAction": "1-2 sentences on what to fix",
      "estimatedImpact": "short phrase"
    }
  ]
}

Sort groups by priority (critical first). Be specific about root causes.`,
        },
        { role: "user", content: `Open alerts (${alertRows.length} total):\n${serialized}` },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1200,
    });
    const result = this.parseAiJson<{
      summary: string;
      groups: Array<{
        id: string;
        title: string;
        platform: string;
        priority: "critical" | "high" | "medium" | "low";
        alertIds: string[];
        rootCause: string;
        recommendedAction: string;
        estimatedImpact: string;
      }>;
    }>(raw);

    await this.saveRecommendation(workspaceId, "triage_alerts", null, contextHash, "gpt-4o-mini", result);
    return { ...result, cached: false };
  }

  @Post("ai/apply-alert-action")
  async applyAlertAction(@Body() body: { alertId: string; actionId: string }) {
    const [alert] = await this.db
      .select()
      .from(alerts)
      .where(eq(alerts.id, body.alertId))
      .limit(1);

    if (!alert) throw new NotFoundException(`Alert ${body.alertId} not found`);

    const payload = alert.payloadJson as Record<string, unknown> | null;
    const live = await this.getAlertLiveContext(alert, payload);
    const action = live?.actions.find((candidate) => candidate.id === body.actionId);

    if (!action) throw new NotFoundException(`Action ${body.actionId} not available for alert ${body.alertId}`);
    if (action.disabled) throw new BadRequestException(action.disabledReason ?? "Action is not currently available");

    if (action.kind === "shopify_variant_price_update") {
      await this.updateShopifyVariantPrice(
        action.params.workspaceId,
        action.params.productId,
        action.params.variantId,
        action.params.price,
      );
      const updatedLive = await this.getAlertLiveContext(alert, payload);
      return {
        ok: true,
        message: `Updated Shopify variant price to ${action.params.currencyCode} ${action.params.price}.`,
        live: updatedLive,
      };
    }

    throw new BadRequestException(`Unsupported action kind: ${action.kind}`);
  }

  @Post("ai/product-fix-assistant")
  async aiProductFixAssistant(@Body() body: { productId: string }) {
    const [product] = await this.db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        canonicalSku: products.canonicalSku,
        descriptionHtml: products.descriptionHtml,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
        gtinExempt: products.gtinExempt,
        workspaceId: products.workspaceId,
      })
      .from(products)
      .where(eq(products.id, body.productId))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${body.productId} not found`);

    const variantRows = await this.db
      .select({
        id: variants.id,
        sku: variants.sku,
        barcode: variants.barcode,
        optionValuesJson: variants.optionValuesJson,
      })
      .from(variants)
      .where(eq(variants.productId, body.productId))
      .orderBy(variants.sku);

    const variantIds = variantRows.map((variant) => variant.id);
    const [listingRows, inventoryRows, revenueRows, gscQueries] = await Promise.all([
      variantIds.length > 0
        ? this.db
            .select({
              variantId: channelListings.variantId,
              platform: integrationAccounts.platform,
              status: channelListings.status,
              buyabilityStatus: channelListings.buyabilityStatus,
              issuesJson: channelListings.issuesJson,
              qualityScore: channelListings.qualityScore,
              platformListingId: channelListings.platformListingId,
            })
            .from(channelListings)
            .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
            .where(inArray(channelListings.variantId, variantIds))
        : Promise.resolve([]),
      variantIds.length > 0
        ? this.db
            .select({
              variantId: inventoryPositions.variantId,
              quantityName: inventoryPositions.quantityName,
              quantityValue: inventoryPositions.quantityValue,
            })
            .from(inventoryPositions)
            .where(inArray(inventoryPositions.variantId, variantIds))
        : Promise.resolve([]),
      this.db
        .select({
          unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
        })
        .from(orderLineItems)
        .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
        .where(
          and(
            eq(orderLineItems.productId, body.productId),
            sql`${orders.createdAt} > now() - interval '90 days'`,
          ),
        ),
      this.db
        .select({
          query: searchPerformance.dimensionValue,
          impressions: searchPerformance.impressions,
          clicks: searchPerformance.clicks,
          position: searchPerformance.position,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "query"),
            sql`${searchPerformance.dimensionValue} ilike ${`%${this.titleToHandle(product.title ?? product.canonicalSku).replace(/-/g, "%")}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(10),
    ]);

    const platformListingIds = [
      ...new Set(
        listingRows
          .map((listing) => listing.platformListingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];

    const alertRows =
      platformListingIds.length > 0
        ? await this.db
            .select({
              severity: alerts.severity,
              category: alerts.category,
              sourcePlatform: alerts.sourcePlatform,
              payloadJson: alerts.payloadJson,
            })
            .from(alerts)
            .where(
              and(
                eq(alerts.workspaceId, product.workspaceId),
                eq(alerts.status, "open"),
                inArray(alerts.entityRef, platformListingIds),
              ),
            )
            .orderBy(desc(alerts.createdAt))
            .limit(10)
        : [];

    const channels = [...new Set(listingRows.map((listing) => listing.platform))].sort();
    const availableInventory = inventoryRows
      .filter((row) => row.quantityName === "available")
      .reduce((total, row) => total + row.quantityValue, 0);
    const amazonQualityScores = listingRows
      .filter((listing) => listing.platform === "amazon_sp" && listing.qualityScore !== null)
      .map((listing) => listing.qualityScore as number);
    const missingAttributes = [
      !product.title?.trim() ? "title" : null,
      !product.brand?.trim() ? "brand" : null,
      !product.gtinExempt && !variantRows.some((variant) => variant.barcode?.trim()) ? "barcode_gtin" : null,
      !product.descriptionHtml || product.descriptionHtml.trim().length < 10 ? "description" : null,
    ].filter(Boolean);

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey });

    const prompt = [
      `Product: ${product.title ?? product.canonicalSku}`,
      `SKU: ${product.canonicalSku}`,
      product.brand ? `Brand: ${product.brand}` : "Brand: missing",
      `Variant count: ${variantRows.length}`,
      `Available inventory: ${availableInventory}`,
      `Channels present: ${channels.length > 0 ? channels.join(", ") : "none"}`,
      `Missing attributes: ${missingAttributes.length > 0 ? missingAttributes.join(", ") : "none"}`,
      `Amazon quality scores: ${amazonQualityScores.length > 0 ? amazonQualityScores.join(", ") : "none"}`,
      `Revenue last 90 days: $${Math.round((revenueRows[0]?.revenueCents ?? 0) / 100)} from ${revenueRows[0]?.unitsSold ?? 0} units`,
      product.seoTitle ? `Current SEO title: ${product.seoTitle}` : "Current SEO title: missing",
      product.seoDescription ? `Current SEO meta description: ${product.seoDescription}` : "Current SEO meta description: missing",
      product.descriptionHtml
        ? `Description text: ${product.descriptionHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 700)}`
        : "Description text: missing",
      gscQueries.length > 0
        ? `Top GSC queries: ${gscQueries.map((row) => `${row.query} (${row.impressions} impressions, ${row.clicks} clicks)`).join("; ")}`
        : "Top GSC queries: none",
      alertRows.length > 0
        ? `Open alerts: ${JSON.stringify(alertRows.map((row) => ({
            severity: row.severity,
            category: row.category,
            platform: row.sourcePlatform,
            payload: row.payloadJson,
          })).slice(0, 5))}`
        : "Open alerts: none",
      listingRows.length > 0
        ? `Listings: ${JSON.stringify(listingRows.map((row) => ({
            platform: row.platform,
            status: row.status,
            buyabilityStatus: row.buyabilityStatus,
            qualityScore: row.qualityScore,
            issues: row.issuesJson,
          })).slice(0, 12))}`
        : "Listings: none",
    ].join("\n");

    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a commerce operations analyst. Given a product health snapshot, produce a practical prioritized fix plan. Prefer concrete, source-of-truth actions. Return JSON only with keys: summary (string), priority (high|medium|low), fixes (array of 3-5 objects with keys title, why, action, channel, impact). Keep each field concise.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 800,
    });
    return this.parseAiJson<{
      summary: string;
      priority: "high" | "medium" | "low";
      fixes: Array<{
        title: string;
        why: string;
        action: string;
        channel: string;
        impact: string;
      }>;
    }>(raw);
  }

  @Post("ai/amazon-listing-rewrite")
  async aiAmazonListingRewrite(@Body() body: { productId: string }) {
    const [product] = await this.db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        canonicalSku: products.canonicalSku,
        descriptionHtml: products.descriptionHtml,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
        workspaceId: products.workspaceId,
      })
      .from(products)
      .where(eq(products.id, body.productId))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${body.productId} not found`);

    const variantRows = await this.db
      .select({
        id: variants.id,
        sku: variants.sku,
        barcode: variants.barcode,
        optionValuesJson: variants.optionValuesJson,
      })
      .from(variants)
      .where(eq(variants.productId, body.productId))
      .orderBy(variants.sku);

    const variantIds = variantRows.map((variant) => variant.id);
    const [amazonListingRows, gscQueries] = await Promise.all([
      variantIds.length > 0
        ? this.db
            .select({
              variantId: channelListings.variantId,
              status: channelListings.status,
              buyabilityStatus: channelListings.buyabilityStatus,
              issuesJson: channelListings.issuesJson,
              qualityScore: channelListings.qualityScore,
              platformListingId: channelListings.platformListingId,
            })
            .from(channelListings)
            .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
            .where(
              and(
                inArray(channelListings.variantId, variantIds),
                eq(integrationAccounts.platform, "amazon_sp"),
              ),
            )
        : Promise.resolve([]),
      this.db
        .select({
          query: searchPerformance.dimensionValue,
          impressions: searchPerformance.impressions,
          clicks: searchPerformance.clicks,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "query"),
            sql`${searchPerformance.dimensionValue} ilike ${`%${this.titleToHandle(product.title ?? product.canonicalSku).replace(/-/g, "%")}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(10),
    ]);

    const variantSummaries = variantRows.map((variant) => ({
      sku: variant.sku,
      barcode: variant.barcode,
      size: getVariantSize(variant.optionValuesJson),
    }));
    const qualityScores = amazonListingRows
      .map((listing) => listing.qualityScore)
      .filter((score): score is number => score !== null);
    const lowestQualityScore = qualityScores.length > 0 ? Math.min(...qualityScores) : null;
    const amazonIssues = amazonListingRows
      .flatMap((listing) => {
        const rawIssues = (listing.issuesJson as { issues?: unknown[] } | unknown[] | null) ?? [];
        return Array.isArray(rawIssues)
          ? rawIssues
          : Array.isArray(rawIssues.issues)
            ? rawIssues.issues
            : [];
      })
      .slice(0, 20);

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey });

    const prompt = [
      `Product title: ${product.title ?? product.canonicalSku}`,
      `Brand: ${product.brand ?? "missing"}`,
      `Canonical SKU: ${product.canonicalSku}`,
      `Variants: ${JSON.stringify(variantSummaries.slice(0, 30))}`,
      `Current Shopify SEO title: ${product.seoTitle ?? "missing"}`,
      `Current Shopify SEO meta description: ${product.seoDescription ?? "missing"}`,
      product.descriptionHtml
        ? `Current product description: ${product.descriptionHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 1000)}`
        : "Current product description: missing",
      `Amazon listing count: ${amazonListingRows.length}`,
      `Amazon quality scores: ${qualityScores.length > 0 ? qualityScores.join(", ") : "none"}`,
      `Lowest Amazon quality score: ${lowestQualityScore ?? "none"}`,
      amazonListingRows.length > 0
        ? `Amazon listings: ${JSON.stringify(amazonListingRows.map((listing) => ({
            status: listing.status,
            buyabilityStatus: listing.buyabilityStatus,
            qualityScore: listing.qualityScore,
            listingId: listing.platformListingId,
            issues: listing.issuesJson,
          })).slice(0, 12))}`
        : "Amazon listings: none",
      amazonIssues.length > 0 ? `Amazon issues: ${JSON.stringify(amazonIssues)}` : "Amazon issues: none",
      gscQueries.length > 0
        ? `Search demand: ${gscQueries.map((row) => `${row.query} (${row.impressions} impressions, ${row.clicks} clicks)`).join("; ")}`
        : "Search demand: none",
    ].join("\n");

    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are an Amazon marketplace listing specialist. Rewrite the listing to improve quality and conversion while staying factual and compliant. Do not invent certifications, materials, dimensions, or claims not present in the input. Return JSON only with keys: summary, title, bullets, description, searchTerms, qualityFixes. title is under 180 chars. bullets is 5 concise benefit-focused strings. description is 1 short paragraph. searchTerms is 8-15 backend search term phrases. qualityFixes is an array of objects with keys field, issue, recommendation.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000,
    });
    return this.parseAiJson<{
      summary: string;
      title: string;
      bullets: string[];
      description: string;
      searchTerms: string[];
      qualityFixes: Array<{
        field: string;
        issue: string;
        recommendation: string;
      }>;
    }>(raw);
  }

  @Post("ai/cross-channel-opportunity")
  async aiCrossChannelOpportunity(@Body() body: { productId: string }) {
    const [product] = await this.db
      .select({
        id: products.id,
        title: products.title,
        brand: products.brand,
        canonicalSku: products.canonicalSku,
        descriptionHtml: products.descriptionHtml,
        seoTitle: products.seoTitle,
        seoDescription: products.seoDescription,
        workspaceId: products.workspaceId,
      })
      .from(products)
      .where(eq(products.id, body.productId))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${body.productId} not found`);

    const variantRows = await this.db
      .select({ id: variants.id, sku: variants.sku, barcode: variants.barcode })
      .from(variants)
      .where(eq(variants.productId, body.productId));

    const variantIds = variantRows.map((variant) => variant.id);
    const [revenueRows, listingRows, pageRows, queryRows] = await Promise.all([
      this.db
        .select({
          unitsSold: sql<number>`coalesce(sum(${orderLineItems.quantity}), 0)::int`,
          revenueCents: sql<number>`coalesce(sum(${orderLineItems.quantity} * ${orderLineItems.unitPriceCents}), 0)::int`,
        })
        .from(orderLineItems)
        .innerJoin(orders, eq(orderLineItems.orderId, orders.id))
        .where(
          and(
            eq(orderLineItems.productId, body.productId),
            sql`${orders.createdAt} > now() - interval '90 days'`,
          ),
        ),
      variantIds.length > 0
        ? this.db
            .select({
              platform: integrationAccounts.platform,
              status: channelListings.status,
              buyabilityStatus: channelListings.buyabilityStatus,
              qualityScore: channelListings.qualityScore,
              issuesJson: channelListings.issuesJson,
              platformListingId: channelListings.platformListingId,
            })
            .from(channelListings)
            .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
            .where(inArray(channelListings.variantId, variantIds))
        : Promise.resolve([]),
      this.db
        .select({
          url: searchPerformance.dimensionValue,
          clicks: searchPerformance.clicks,
          impressions: searchPerformance.impressions,
          position: searchPerformance.position,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "page"),
            sql`${searchPerformance.dimensionValue} ilike ${`%/products/${this.titleToHandle(product.title ?? product.canonicalSku)}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(10),
      this.db
        .select({
          query: searchPerformance.dimensionValue,
          clicks: searchPerformance.clicks,
          impressions: searchPerformance.impressions,
          position: searchPerformance.position,
        })
        .from(searchPerformance)
        .where(
          and(
            eq(searchPerformance.workspaceId, product.workspaceId),
            eq(searchPerformance.dimension, "query"),
            sql`${searchPerformance.dimensionValue} ilike ${`%${this.titleToHandle(product.title ?? product.canonicalSku).replace(/-/g, "%")}%`}`,
          ),
        )
        .orderBy(desc(searchPerformance.impressions))
        .limit(10),
    ]);

    const platformListingIds = [
      ...new Set(
        listingRows
          .map((listing) => listing.platformListingId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const alertRows =
      platformListingIds.length > 0
        ? await this.db
            .select({
              severity: alerts.severity,
              category: alerts.category,
              sourcePlatform: alerts.sourcePlatform,
              payloadJson: alerts.payloadJson,
            })
            .from(alerts)
            .where(
              and(
                eq(alerts.workspaceId, product.workspaceId),
                eq(alerts.status, "open"),
                inArray(alerts.entityRef, platformListingIds),
              ),
            )
            .orderBy(desc(alerts.createdAt))
            .limit(8)
        : [];

    const revenueCents = revenueRows[0]?.revenueCents ?? 0;
    const unitsSold = revenueRows[0]?.unitsSold ?? 0;
    const channels = [...new Set(listingRows.map((listing) => listing.platform))].sort();
    const gscClicks = pageRows.reduce((total, row) => total + row.clicks, 0);
    const gscImpressions = pageRows.reduce((total, row) => total + row.impressions, 0);
    const amazonQualityScores = listingRows
      .filter((listing) => listing.platform === "amazon_sp" && listing.qualityScore !== null)
      .map((listing) => listing.qualityScore as number);
    const flag =
      gscImpressions >= 100 && revenueCents === 0
        ? "no_revenue"
        : revenueCents > 0 && !channels.includes("amazon_sp")
          ? "opportunity"
          : revenueCents > 0 && !channels.includes("merchant")
            ? "no_listing"
            : "ok";

    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");
    const openai = new OpenAI({ apiKey });

    const prompt = [
      `Product: ${product.title ?? product.canonicalSku}`,
      `SKU: ${product.canonicalSku}`,
      `Brand: ${product.brand ?? "missing"}`,
      `Cross-channel flag: ${flag}`,
      `Revenue last 90 days: $${Math.round(revenueCents / 100)} from ${unitsSold} units`,
      `GSC page traffic: ${gscImpressions} impressions, ${gscClicks} clicks`,
      `Channels present: ${channels.length > 0 ? channels.join(", ") : "none"}`,
      `Amazon quality scores: ${amazonQualityScores.length > 0 ? amazonQualityScores.join(", ") : "none"}`,
      `Variant count: ${variantRows.length}`,
      `Any barcode: ${variantRows.some((variant) => variant.barcode?.trim()) ? "yes" : "no"}`,
      `SEO title: ${product.seoTitle ?? "missing"}`,
      `SEO description: ${product.seoDescription ?? "missing"}`,
      queryRows.length > 0
        ? `Top search queries: ${queryRows.map((row) => `${row.query} (${row.impressions} impressions, ${row.clicks} clicks, pos ${row.position / 10})`).join("; ")}`
        : "Top search queries: none",
      listingRows.length > 0
        ? `Listings: ${JSON.stringify(listingRows.map((row) => ({
            platform: row.platform,
            status: row.status,
            buyabilityStatus: row.buyabilityStatus,
            qualityScore: row.qualityScore,
            issues: row.issuesJson,
          })).slice(0, 12))}`
        : "Listings: none",
      alertRows.length > 0
        ? `Open alerts: ${JSON.stringify(alertRows.map((row) => ({
            severity: row.severity,
            category: row.category,
            platform: row.sourcePlatform,
            payload: row.payloadJson,
          })))}`
        : "Open alerts: none",
    ].join("\n");

    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a cross-channel ecommerce growth analyst. Explain the product opportunity across Shopify, Google Merchant Center, Amazon, SEO, and revenue. Return JSON only with keys: summary, likelyCause, nextBestAction, expectedUpside, fixes. fixes is an array of 2-4 objects with keys action, channel, reason. Be concise and practical.",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 700,
    });
    return this.parseAiJson<{
      summary: string;
      likelyCause: string;
      nextBestAction: string;
      expectedUpside: string;
      fixes: Array<{ action: string; channel: string; reason: string }>;
    }>(raw);
  }

  @Post("ai/optimize-page")
  async aiOptimizePage(
    @Body() body: { url: string; position: number; impressions: number; topQueries: string[] },
  ) {
    const apiKey = this.config.get<string>("OPENAI_API_KEY");
    if (!apiKey) throw new NotFoundException("OPENAI_API_KEY not configured");

    const urlPath = new URL(body.url.startsWith("http") ? body.url : `https://x${body.url}`).pathname;
    const handle = urlPath.split("/").filter(Boolean).pop() ?? "";
    const handleAsSearch = `%${handle.replace(/-/g, "%")}%`;

    const [matchedProduct] = handle
      ? await this.db
          .select({
            id: products.id,
            workspaceId: products.workspaceId,
            title: products.title,
            brand: products.brand,
            descriptionHtml: products.descriptionHtml,
            seoTitle: products.seoTitle,
            seoDescription: products.seoDescription,
          })
          .from(products)
          .where(ilike(products.title, handleAsSearch))
          .limit(1)
      : [];

    const [workspaceRow] = matchedProduct
      ? [matchedProduct]
      : await this.db.select({ workspaceId: products.workspaceId }).from(products).limit(1);

    const workspaceId = workspaceRow?.workspaceId ?? null;
    if (!workspaceId) throw new NotFoundException("No workspace found");

    const contextInput = {
      url: body.url,
      position: Math.round(body.position * 10),
      impressions: body.impressions,
      topQueries: body.topQueries.slice(0, 8).sort(),
      productId: matchedProduct?.id ?? null,
      seoTitle: matchedProduct?.seoTitle ?? null,
      seoDescription: matchedProduct?.seoDescription ?? null,
    };
    const contextHash = this.hashContext(contextInput);

    const cached = await this.getCachedRecommendation<{
      seoTitle: string; metaDescription: string; reasoning: string;
      productId: string | null; productTitle: string | null; recommendationId: string;
    }>(workspaceId, "optimize_page", body.url, contextHash);
    if (cached) return { ...cached, cached: true };

    const prompt = [
      `Page URL: ${body.url}`,
      `Current position: ${body.position.toFixed(1)}`,
      `Impressions (90 days): ${body.impressions}`,
      body.topQueries.length > 0
        ? `Top queries this page ranks for: ${body.topQueries.slice(0, 8).join(", ")}`
        : "Top queries: none",
      matchedProduct?.title ? `Product title: ${matchedProduct.title}` : null,
      matchedProduct?.brand ? `Brand: ${matchedProduct.brand}` : null,
      matchedProduct?.seoTitle ? `Current SEO title: ${matchedProduct.seoTitle}` : "Current SEO title: none",
      matchedProduct?.seoDescription ? `Current meta description: ${matchedProduct.seoDescription}` : "Current meta description: none",
      matchedProduct?.descriptionHtml
        ? `Product description: ${matchedProduct.descriptionHtml.replace(/<[^>]+>/g, " ").trim().slice(0, 400)}`
        : null,
    ].filter(Boolean).join("\n");

    const openai = new OpenAI({ apiKey });
    const raw = await this.callAi(openai, {
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are an SEO specialist. Given a product page from Google Search Console with its current ranking, impressions, and the specific queries it ranks for, write a targeted SEO title (50-60 characters) and meta description (140-160 characters) designed to improve CTR for this specific product and move it toward the top 3. Use the product's actual name, brand, and key attributes. Return JSON only with keys: seoTitle (string), metaDescription (string), reasoning (1-2 sentences on the main optimization decision).",
        },
        { role: "user", content: prompt },
      ],
      response_format: { type: "json_object" },
      max_tokens: 400,
    });
    const aiResult = this.parseAiJson<{ seoTitle: string; metaDescription: string; reasoning: string }>(raw);
    const output = {
      ...aiResult,
      productId: matchedProduct?.id ?? null,
      productTitle: matchedProduct?.title ?? null,
    };
    const recommendationId = await this.saveRecommendation(workspaceId, "optimize_page", body.url, contextHash, "gpt-4o-mini", output);
    return { ...output, recommendationId, cached: false };
  }

  @Patch("ai/recommendations/:id/accept")
  async acceptRecommendation(@Param("id") id: string) {
    const result = await this.db
      .update(aiRecommendations)
      .set({ status: "accepted", acceptedAt: new Date() })
      .where(eq(aiRecommendations.id, id))
      .returning({ id: aiRecommendations.id });
    if (result.length === 0) throw new NotFoundException(`Recommendation ${id} not found`);
    return { ok: true };
  }

  @Patch("products/:id/seo")
  async updateProductSeo(
    @Param("id") id: string,
    @Body() body: { seoTitle: string; seoDescription: string },
  ) {
    const [product] = await this.db
      .select({
        id: products.id,
        workspaceId: products.workspaceId,
        title: products.title,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    // Find the Shopify product GID from channelListings
    const [listingRow] = await this.db
      .select({ platformListingId: channelListings.platformListingId })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
      .where(
        and(
          eq(variants.productId, id),
          eq(integrationAccounts.platform, "shopify"),
        ),
      )
      .limit(1);

    if (!listingRow?.platformListingId) {
      throw new BadRequestException("No Shopify listing found for this product");
    }

    const shopifyProductGid = listingRow.platformListingId;
    const account = await this.getShopifyAccount(product.workspaceId);
    const accessToken = decryptToken(account.encryptedAccessToken!);

    const data = await this.shopifyGraphql<{
      productUpdate: {
        product: { id: string; seo: { title: string; description: string } } | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        mutation UpdateProductSeo($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id seo { title description } }
            userErrors { field message }
          }
        }
      `,
      {
        input: {
          id: shopifyProductGid,
          seo: { title: body.seoTitle, description: body.seoDescription },
        },
      },
    );

    const errors = data.productUpdate.userErrors;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((e) => e.message).join("; "));
    }

    // Persist to local DB
    await this.db
      .update(products)
      .set({ seoTitle: body.seoTitle, seoDescription: body.seoDescription, updatedAt: new Date() })
      .where(eq(products.id, id));

    return { ok: true, seoTitle: body.seoTitle, seoDescription: body.seoDescription };
  }

  @Patch("products/:id/attributes")
  async updateProductAttributes(
    @Param("id") id: string,
    @Body() body: { attribute: string; value: string; platforms?: string[] },
  ) {
    const value = body.value?.trim();
    if (!value) throw new BadRequestException("Attribute value is required");
    if (body.attribute !== "brand" && body.attribute !== "description") {
      throw new BadRequestException(`Unsupported product attribute: ${body.attribute}`);
    }

    const [product] = await this.db
      .select({
        id: products.id,
        workspaceId: products.workspaceId,
        title: products.title,
      })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    const pushed: string[] = [];
    const queued: string[] = [];

    if (!body.platforms || body.platforms.includes("shopify")) {
      if (body.attribute === "brand") {
        await this.updateShopifyProductFields(product.workspaceId, id, { vendor: value });
      } else {
        // Wrap plain text in <p> tags if it doesn't look like HTML already
        const html = value.startsWith("<") ? value : `<p>${value.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
        await this.updateShopifyProductFields(product.workspaceId, id, { descriptionHtml: html });
      }
      pushed.push("shopify");
    }

    if (body.attribute === "brand") {
      await this.db.update(products).set({ brand: value, updatedAt: new Date() }).where(eq(products.id, id));
    } else {
      const html = value.startsWith("<") ? value : `<p>${value.replace(/\n\n+/g, "</p><p>").replace(/\n/g, "<br>")}</p>`;
      await this.db.update(products).set({ descriptionHtml: html, updatedAt: new Date() }).where(eq(products.id, id));
    }

    const downstreamPlatforms = (body.platforms ?? ["merchant", "amazon_sp"]).filter((platform) =>
      platform === "merchant" || platform === "amazon_sp",
    );
    if (downstreamPlatforms.length > 0) {
      queued.push(...(await this.enqueueWorkspaceSyncs(product.workspaceId, downstreamPlatforms)));
    }

    const attrLabel = body.attribute === "brand" ? "Brand" : "Description";
    return {
      ok: true,
      attribute: body.attribute,
      value,
      pushed,
      queued,
      message:
        queued.length > 0
          ? `Updated ${attrLabel} and queued ${queued.map((p) => p === "merchant" ? "Merchant" : "Amazon").join(", ")} sync.`
          : `Updated ${attrLabel}.`,
    };
  }

  @Patch("products/:id/variants/:variantId/barcode")
  async updateVariantBarcode(
    @Param("id") id: string,
    @Param("variantId") variantId: string,
    @Body() body: { barcode: string; platforms?: string[] },
  ) {
    const barcode = body.barcode?.trim();
    if (!barcode) throw new BadRequestException("Barcode is required");

    const [variant] = await this.db
      .select({
        id: variants.id,
        productId: variants.productId,
        sku: variants.sku,
        optionValuesJson: variants.optionValuesJson,
        workspaceId: products.workspaceId,
      })
      .from(variants)
      .innerJoin(products, eq(variants.productId, products.id))
      .where(and(eq(variants.id, variantId), eq(variants.productId, id)))
      .limit(1);

    if (!variant) throw new NotFoundException(`Variant ${variantId} not found for product ${id}`);

    const pushed: string[] = [];
    const queued: string[] = [];

    if (!body.platforms || body.platforms.includes("shopify")) {
      await this.updateShopifyVariantFields(variant.workspaceId, variant.productId, variant.optionValuesJson, { barcode });
      pushed.push("shopify");
    }

    await this.db
      .update(variants)
      .set({ barcode, updatedAt: new Date() })
      .where(eq(variants.id, variant.id));

    const downstreamPlatforms = (body.platforms ?? ["merchant", "amazon_sp"]).filter((platform) =>
      platform === "merchant" || platform === "amazon_sp",
    );
    if (downstreamPlatforms.length > 0) {
      queued.push(...(await this.enqueueWorkspaceSyncs(variant.workspaceId, downstreamPlatforms)));
    }

    return {
      ok: true,
      variantId: variant.id,
      sku: variant.sku,
      barcode,
      pushed,
      queued,
      message:
        queued.length > 0
          ? `Updated barcode and queued ${queued.map((platform) => platform === "merchant" ? "Merchant" : "Amazon").join(", ")} sync.`
          : "Updated barcode.",
    };
  }

  @Patch("products/:id/gtin-exempt")
  async setGtinExempt(
    @Param("id") id: string,
    @Body() body: { exempt: boolean },
  ) {
    const [product] = await this.db
      .select({ id: products.id })
      .from(products)
      .where(eq(products.id, id))
      .limit(1);

    if (!product) throw new NotFoundException(`Product ${id} not found`);

    await this.db
      .update(products)
      .set({ gtinExempt: body.exempt, updatedAt: new Date() })
      .where(eq(products.id, id));

    return { ok: true, gtinExempt: body.exempt };
  }

  @Post("integrations/:id/sync")
  async triggerSync(@Param("id") id: string) {
    const [integration] = await this.db
      .select({ id: integrationAccounts.id, platform: integrationAccounts.platform, workspaceId: integrationAccounts.workspaceId })
      .from(integrationAccounts)
      .where(eq(integrationAccounts.id, id))
      .limit(1);

    if (!integration) throw new NotFoundException(`Integration ${id} not found`);

    const syncConfig: Record<string, { queue: Queue; jobType: string }> = {
      shopify: { queue: this.shopifyQueue, jobType: "shopify_initial_sync" },
      shopify_orders: { queue: this.shopifyOrdersQueue, jobType: "shopify_orders_sync" },
      merchant: { queue: this.merchantQueue, jobType: "merchant_initial_sync" },
      search_console: { queue: this.gscQueue, jobType: "gsc_initial_sync" },
      amazon_sp: { queue: this.amazonQueue, jobType: "amazon_initial_sync" },
    };

    const config = syncConfig[integration.platform];
    if (!config) throw new NotFoundException(`No sync handler for platform: ${integration.platform}`);

    const [syncJob] = await this.db
      .insert(syncJobs)
      .values({ integrationAccountId: integration.id, jobType: config.jobType, state: "pending" })
      .returning({ id: syncJobs.id });

    await config.queue.add(config.jobType, { syncJobId: syncJob.id }, { attempts: 3, backoff: { type: "exponential", delay: 5000 } });

    return { ok: true, syncJobId: syncJob.id };
  }

  @Get("operations/jobs/failed")
  async failedJobs() {
    const rows = await this.db
      .select({
        id: syncJobs.id,
        integrationAccountId: syncJobs.integrationAccountId,
        platform: integrationAccounts.platform,
        shopDomain: integrationAccounts.shopDomain,
        jobType: syncJobs.jobType,
        state: syncJobs.state,
        retryCount: syncJobs.retryCount,
        payloadJson: syncJobs.payloadJson,
        errorJson: syncJobs.errorJson,
        createdAt: syncJobs.createdAt,
        startedAt: syncJobs.startedAt,
        finishedAt: syncJobs.finishedAt,
      })
      .from(syncJobs)
      .innerJoin(integrationAccounts, eq(syncJobs.integrationAccountId, integrationAccounts.id))
      .where(eq(syncJobs.state, "failed"))
      .orderBy(desc(syncJobs.createdAt))
      .limit(100);

    return rows.map((row) => ({
      ...row,
      createdAt: row.createdAt?.toISOString() ?? null,
      startedAt: row.startedAt?.toISOString() ?? null,
      finishedAt: row.finishedAt?.toISOString() ?? null,
    }));
  }

  @Patch("alerts/:id/resolve")
  async resolveAlert(@Param("id") id: string) {
    const result = await this.db
      .update(alerts)
      .set({ status: "resolved" })
      .where(and(eq(alerts.id, id), eq(alerts.status, "open")))
      .returning({ id: alerts.id });

    if (result.length === 0) throw new NotFoundException(`Alert ${id} not found or already resolved`);

    return { ok: true };
  }

  @Delete("jobs/failed")
  async clearFailedJobs() {
    await this.db
      .update(syncJobs)
      .set({ state: "dismissed" })
      .where(eq(syncJobs.state, "failed"));

    return { ok: true };
  }

  private async getAlertLiveContext(
    alert: typeof alerts.$inferSelect,
    payload: Record<string, unknown> | null,
  ) {
    const offerId = typeof payload?.["offer_id"] === "string" ? payload["offer_id"] : null;
    const merchantResourceName =
      typeof payload?.["merchant_product_name"] === "string"
        ? payload["merchant_product_name"]
        : alert.entityRef;
    const local = await this.findLocalVariantForAlert(alert, offerId);
    const [shopifyVariant, merchantProduct] = await Promise.all([
      local?.shopifyVariantId ? this.fetchShopifyVariantSnapshot(local.workspaceId, local.shopifyVariantId) : null,
      merchantResourceName ? this.fetchMerchantProductSnapshot(merchantResourceName) : null,
    ]);

    const priceComparison = this.comparePrices(shopifyVariant, merchantProduct);
    const actions: AlertAction[] = [];

    if (
      alert.sourcePlatform === "merchant" &&
      priceComparison?.status === "different" &&
      local?.shopifyVariantId &&
      shopifyVariant?.productId &&
      merchantProduct?.price
    ) {
      actions.push({
        id: "update_shopify_price_to_merchant",
        label: `Update Shopify price to ${merchantProduct.currencyCode ?? "USD"} ${merchantProduct.price}`,
        description:
          "Writes the live Google Merchant price onto the matching Shopify variant, then you can re-sync Merchant.",
        kind: "shopify_variant_price_update",
        params: {
          workspaceId: local.workspaceId,
          variantId: local.shopifyVariantId,
          productId: shopifyVariant.productId,
          price: merchantProduct.price,
          currencyCode: merchantProduct.currencyCode ?? shopifyVariant.currencyCode ?? "USD",
        },
      });
    }

    return {
      product: local
        ? {
            id: local.productId,
            title: local.productTitle,
            canonicalSku: local.canonicalSku,
            variantId: local.variantId,
            sku: local.sku,
          }
        : null,
      shopifyVariant,
      merchantProduct,
      priceComparison,
      actions,
    };
  }

  private async findLocalVariantForAlert(alert: typeof alerts.$inferSelect, offerId: string | null) {
    const shopifyVariantId = offerId?.match(/shopify_[A-Z]{2}_[0-9]+_([0-9]+)/)?.[1];
    const shopifyVariantGid = shopifyVariantId ? `gid://shopify/ProductVariant/${shopifyVariantId}` : null;

    const variantMatch = shopifyVariantGid
      ? await this.db
          .select({
            variantId: variants.id,
            sku: variants.sku,
            optionValuesJson: variants.optionValuesJson,
            productId: products.id,
            productTitle: products.title,
            canonicalSku: products.canonicalSku,
            workspaceId: products.workspaceId,
          })
          .from(variants)
          .innerJoin(products, eq(variants.productId, products.id))
          .where(sql`${variants.optionValuesJson}->>'shopifyVariantId' = ${shopifyVariantGid}`)
          .limit(1)
      : [];

    const [fallbackMatch] =
      variantMatch.length > 0
        ? variantMatch
        : await this.db
            .select({
              variantId: variants.id,
              sku: variants.sku,
              optionValuesJson: variants.optionValuesJson,
              productId: products.id,
              productTitle: products.title,
              canonicalSku: products.canonicalSku,
              workspaceId: products.workspaceId,
            })
            .from(channelListings)
            .innerJoin(variants, eq(channelListings.variantId, variants.id))
            .innerJoin(products, eq(variants.productId, products.id))
            .where(
              or(
                alert.entityRef ? eq(channelListings.platformListingId, alert.entityRef) : undefined,
                offerId ? ilike(channelListings.platformListingId, `%${offerId}%`) : undefined,
              ),
            )
            .limit(1);

    if (!fallbackMatch) return null;

    const optionValues = fallbackMatch.optionValuesJson as { shopifyVariantId?: unknown } | null;
    const storedShopifyVariantId =
      typeof optionValues?.shopifyVariantId === "string" ? optionValues.shopifyVariantId : null;

    return {
      ...fallbackMatch,
      shopifyVariantId: storedShopifyVariantId ?? shopifyVariantGid,
    };
  }

  private async fetchMerchantProductSnapshot(resourceName: string) {
    try {
      const product = await this.merchantApi.getProduct(resourceName);
      const price = this.extractMerchantPrice(product);
      return {
        name: product.name ?? resourceName,
        offerId: product.offerId ?? null,
        title: product.productAttributes?.title ?? product.attributes?.title ?? null,
        link: product.productAttributes?.link ?? product.attributes?.link ?? null,
        price: price?.amount ?? null,
        currencyCode: price?.currencyCode ?? null,
        lastUpdateDate: product.productStatus?.lastUpdateDate ?? null,
        rawIssues: product.productStatus?.itemLevelIssues ?? [],
      };
    } catch (error) {
      return {
        name: resourceName,
        offerId: null,
        title: null,
        link: null,
        price: null,
        currencyCode: null,
        lastUpdateDate: null,
        rawIssues: [],
        error: error instanceof Error ? error.message : "Unable to fetch live Merchant product",
      };
    }
  }

  private extractMerchantPrice(product: MerchantProduct) {
    const price = product.productAttributes?.salePrice ??
      product.attributes?.salePrice ??
      product.productAttributes?.price ??
      product.attributes?.price;
    const amountMicros = price?.amountMicros;
    const amountNumber =
      typeof amountMicros === "string" ? Number(amountMicros) : typeof amountMicros === "number" ? amountMicros : null;

    if (amountNumber === null || !Number.isFinite(amountNumber)) return null;

    return {
      amount: (amountNumber / 1_000_000).toFixed(2),
      currencyCode: price?.currencyCode ?? "USD",
    };
  }

  private async fetchShopifyVariant(workspaceId: string, variantId: string) {
    const account = await this.getShopifyAccount(workspaceId);
    const accessToken = decryptToken(account.encryptedAccessToken!);
    const data = await this.shopifyGraphql<{
      node: {
        id: string;
        sku: string | null;
        price: string;
        compareAtPrice: string | null;
        product: { id: string; title: string };
      } | null;
      shop: { currencyCode?: string };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        query VariantPrice($id: ID!) {
          node(id: $id) {
            ... on ProductVariant {
              id
              sku
              price
              compareAtPrice
              product { id title }
            }
          }
          shop { currencyCode }
        }
      `,
      { id: variantId },
    );

    if (!data.node) return null;

    return {
      id: data.node.id,
      sku: data.node.sku,
      price: Number(data.node.price).toFixed(2),
      compareAtPrice: data.node.compareAtPrice ? Number(data.node.compareAtPrice).toFixed(2) : null,
      currencyCode: data.shop.currencyCode ?? "USD",
      productId: data.node.product.id,
      productTitle: data.node.product.title,
    };
  }

  private async fetchShopifyVariantSnapshot(workspaceId: string, variantId: string) {
    try {
      return await this.fetchShopifyVariant(workspaceId, variantId);
    } catch (error) {
      return {
        id: variantId,
        sku: null,
        price: null,
        compareAtPrice: null,
        currencyCode: null,
        productId: null,
        productTitle: null,
        error: error instanceof Error ? error.message : "Unable to fetch live Shopify variant",
      };
    }
  }

  private comparePrices(
    shopifyVariant: Awaited<ReturnType<AppController["fetchShopifyVariantSnapshot"]>>,
    merchantProduct: Awaited<ReturnType<AppController["fetchMerchantProductSnapshot"]>> | null,
  ) {
    if (!shopifyVariant?.price || !merchantProduct?.price) {
      return {
        status: "missing_live_data",
        message: "Could not fetch both live Shopify and Merchant prices.",
      };
    }

    const shopifyPrice = Number(shopifyVariant.price);
    const merchantPrice = Number(merchantProduct.price);
    if (!Number.isFinite(shopifyPrice) || !Number.isFinite(merchantPrice)) {
      return {
        status: "missing_live_data",
        message: "One of the live prices could not be parsed.",
      };
    }

    if (Math.round(shopifyPrice * 100) === Math.round(merchantPrice * 100)) {
      return {
        status: "match",
        message: "Live Shopify and Google Merchant prices match.",
      };
    }

    return {
      status: "different",
      message: "Live Shopify and Google Merchant prices are different.",
      delta: (shopifyPrice - merchantPrice).toFixed(2),
    };
  }

  private async updateShopifyVariantPrice(
    workspaceId: string,
    productId: string,
    variantId: string,
    price: string,
  ) {
    const account = await this.getShopifyAccount(workspaceId);
    const accessToken = decryptToken(account.encryptedAccessToken!);

    const data = await this.shopifyGraphql<{
      productVariantsBulkUpdate: {
        productVariants: Array<{ id: string; price: string }>;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        mutation UpdateVariantPrice($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id price }
            userErrors { field message }
          }
        }
      `,
      { productId, variants: [{ id: variantId, price }] },
    );

    const errors = data.productVariantsBulkUpdate.userErrors;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((error) => error.message).join("; "));
    }

    return data.productVariantsBulkUpdate.productVariants[0] ?? null;
  }

  private async updateShopifyVariantFields(
    workspaceId: string,
    productId: string,
    optionValuesJson: unknown,
    fields: { barcode?: string },
  ) {
    const optionValues = optionValuesJson as { shopifyVariantId?: unknown } | null;
    const shopifyVariantId =
      typeof optionValues?.shopifyVariantId === "string" ? optionValues.shopifyVariantId : null;
    if (!shopifyVariantId) {
      throw new BadRequestException("No Shopify variant ID found for this variant");
    }

    const [listingRow] = await this.db
      .select({ platformListingId: channelListings.platformListingId })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
      .where(
        and(
          eq(variants.productId, productId),
          eq(integrationAccounts.platform, "shopify"),
        ),
      )
      .limit(1);

    if (!listingRow?.platformListingId) {
      throw new BadRequestException("No Shopify listing found for this product");
    }

    const account = await this.getShopifyAccount(workspaceId);
    const accessToken = decryptToken(account.encryptedAccessToken!);
    const variantInput: Record<string, string> = { id: shopifyVariantId };
    if (fields.barcode) variantInput.barcode = fields.barcode;

    const data = await this.shopifyGraphql<{
      productVariantsBulkUpdate: {
        productVariants: Array<{ id: string; barcode: string | null }>;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        mutation UpdateVariantFields($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            productVariants { id barcode }
            userErrors { field message }
          }
        }
      `,
      { productId: listingRow.platformListingId, variants: [variantInput] },
    );

    const errors = data.productVariantsBulkUpdate.userErrors;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((error) => error.message).join("; "));
    }

    return data.productVariantsBulkUpdate.productVariants[0] ?? null;
  }

  private async updateShopifyProductFields(
    workspaceId: string,
    productId: string,
    fields: { vendor?: string; descriptionHtml?: string },
  ) {
    const [listingRow] = await this.db
      .select({ platformListingId: channelListings.platformListingId })
      .from(channelListings)
      .innerJoin(variants, eq(channelListings.variantId, variants.id))
      .innerJoin(integrationAccounts, eq(channelListings.integrationAccountId, integrationAccounts.id))
      .where(
        and(
          eq(variants.productId, productId),
          eq(integrationAccounts.platform, "shopify"),
        ),
      )
      .limit(1);

    if (!listingRow?.platformListingId) {
      throw new BadRequestException("No Shopify listing found for this product");
    }

    const account = await this.getShopifyAccount(workspaceId);
    const accessToken = decryptToken(account.encryptedAccessToken!);
    const input: Record<string, string> = { id: listingRow.platformListingId };
    if (fields.vendor) input.vendor = fields.vendor;
    if (fields.descriptionHtml !== undefined) input.descriptionHtml = fields.descriptionHtml;

    const data = await this.shopifyGraphql<{
      productUpdate: {
        product: { id: string; vendor?: string | null; descriptionHtml?: string | null } | null;
        userErrors: Array<{ field?: string[]; message: string }>;
      };
    }>(
      account.shopDomain!,
      accessToken,
      `#graphql
        mutation UpdateProductFields($input: ProductInput!) {
          productUpdate(input: $input) {
            product { id vendor descriptionHtml }
            userErrors { field message }
          }
        }
      `,
      { input },
    );

    const errors = data.productUpdate.userErrors;
    if (errors.length > 0) {
      throw new BadRequestException(errors.map((error) => error.message).join("; "));
    }

    return data.productUpdate.product;
  }

  private async enqueueWorkspaceSyncs(workspaceId: string, platforms: string[]) {
    const uniquePlatforms = [...new Set(platforms)];
    if (uniquePlatforms.length === 0) return [];

    const syncConfig: Record<string, { queue: Queue; jobType: string }> = {
      merchant: { queue: this.merchantQueue, jobType: "merchant_initial_sync" },
      amazon_sp: { queue: this.amazonQueue, jobType: "amazon_initial_sync" },
    };

    const integrations = await this.db
      .select({
        id: integrationAccounts.id,
        platform: integrationAccounts.platform,
      })
      .from(integrationAccounts)
      .where(
        and(
          eq(integrationAccounts.workspaceId, workspaceId),
          inArray(integrationAccounts.platform, uniquePlatforms),
          eq(integrationAccounts.status, "active"),
        ),
      );

    const queued: string[] = [];
    for (const integration of integrations) {
      const config = syncConfig[integration.platform];
      if (!config) continue;

      const [syncJob] = await this.db
        .insert(syncJobs)
        .values({ integrationAccountId: integration.id, jobType: config.jobType, state: "pending" })
        .returning({ id: syncJobs.id });

      await config.queue.add(
        config.jobType,
        { syncJobId: syncJob.id },
        { attempts: 3, backoff: { type: "exponential", delay: 5000 } },
      );
      queued.push(integration.platform);
    }

    return queued;
  }

  private getAmazonListingStatus(status: string): string {
    const normalized = status.toUpperCase();
    if (normalized === "BUYABLE") return "published";
    if (normalized === "DISCOVERABLE") return "unlisted";
    return "issue";
  }

  private async getShopifyAccount(workspaceId?: string | null) {
    const rows = await this.db
      .select()
      .from(integrationAccounts)
      .where(
        workspaceId
          ? and(eq(integrationAccounts.platform, "shopify"), eq(integrationAccounts.workspaceId, workspaceId))
          : eq(integrationAccounts.platform, "shopify"),
      )
      .limit(1);
    const account = rows[0];

    if (!account?.shopDomain || !account.encryptedAccessToken) {
      throw new BadRequestException("Shopify integration is not connected with an access token");
    }

    return account;
  }

  private async shopifyGraphql<T>(
    shopDomain: string,
    accessToken: string,
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T> {
    const apiVersion = this.config.get<string>("SHOPIFY_API_VERSION", "2025-10");
    const response = await fetch(`https://${shopDomain}/admin/api/${apiVersion}/graphql.json`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": accessToken,
      },
      body: JSON.stringify({ query, variables }),
    });
    const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> | string };

    if (!response.ok || body.errors || !body.data) {
      throw new BadRequestException(
        `Shopify GraphQL request failed: ${typeof body.errors === "string" ? body.errors : JSON.stringify(body.errors ?? body)}`,
      );
    }

    return body.data;
  }

  private parseAiJson<T>(raw: string): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      throw new InternalServerErrorException('AI response could not be parsed as JSON');
    }
  }

  private async callAi(openai: OpenAI, params: Parameters<OpenAI['chat']['completions']['create']>[0]): Promise<string> {
    let completion: import('openai').OpenAI.Chat.ChatCompletion;
    try {
      completion = await openai.chat.completions.create({ ...params, stream: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new InternalServerErrorException(`AI service error: ${msg}`);
    }
    return completion.choices[0]?.message?.content ?? '{}';
  }

  private hashContext(input: unknown): string {
    return createHash("sha256").update(JSON.stringify(input)).digest("hex");
  }

  private async getCachedRecommendation<T>(
    workspaceId: string,
    sourceType: string,
    entityId: string | null,
    contextHash: string,
  ): Promise<T | null> {
    const [row] = await this.db
      .select({ outputJson: aiRecommendations.outputJson })
      .from(aiRecommendations)
      .where(
        and(
          eq(aiRecommendations.workspaceId, workspaceId),
          eq(aiRecommendations.sourceType, sourceType),
          entityId ? eq(aiRecommendations.entityId, entityId) : sql`${aiRecommendations.entityId} is null`,
          eq(aiRecommendations.contextHash, contextHash),
        ),
      )
      .orderBy(desc(aiRecommendations.createdAt))
      .limit(1);
    return row ? (row.outputJson as T) : null;
  }

  private async saveRecommendation(
    workspaceId: string,
    sourceType: string,
    entityId: string | null,
    contextHash: string,
    model: string,
    outputJson: unknown,
  ): Promise<string> {
    const [row] = await this.db
      .insert(aiRecommendations)
      .values({
        workspaceId,
        sourceType,
        entityId,
        contextHash,
        model,
        outputJson: outputJson as Record<string, unknown>,
      })
      .returning({ id: aiRecommendations.id });
    return row.id;
  }

  private titleToHandle(title: string): string {
    return title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  private async isPostgresReachable(): Promise<boolean> {
    try {
      const [dbResult] = await this.sql<{ ok: number }[]>`SELECT 1 AS ok`;
      return dbResult?.ok === 1;
    } catch {
      return false;
    }
  }

  private async isRedisReachable(): Promise<boolean> {
    const redis = new Redis(this.config.get<string>("REDIS_URL", "redis://localhost:6379"), {
      maxRetriesPerRequest: 1
    });

    try {
      const redisResult = await redis.ping();
      return redisResult === "PONG";
    } catch {
      return false;
    } finally {
      redis.disconnect();
    }
  }
}
