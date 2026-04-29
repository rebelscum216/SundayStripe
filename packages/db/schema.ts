import {
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const workspaces = pgTable("workspaces", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  defaultCurrency: text("default_currency").notNull().default("USD"),
  timezone: text("timezone").notNull().default("America/New_York"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const integrationAccounts = pgTable("integration_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  platform: text("platform").notNull(),
  externalAccountId: text("external_account_id"),
  shopDomain: text("shop_domain"),
  region: text("region"),
  marketplaceId: text("marketplace_id"),
  status: text("status").notNull().default("active"),
  scopesJson: jsonb("scopes_json"),
  encryptedAccessToken: text("encrypted_access_token"),
  encryptedRefreshToken: text("encrypted_refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    canonicalSku: text("canonical_sku").notNull(),
    brand: text("brand"),
    title: text("title"),
    descriptionHtml: text("description_html"),
    sourceOfTruth: text("source_of_truth").notNull().default("shopify"),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    workspaceSkuIdx: uniqueIndex("products_workspace_sku_unique").on(
      table.workspaceId,
      table.canonicalSku
    )
  })
);

export const variants = pgTable("variants", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  sku: text("sku").notNull(),
  barcode: text("barcode"),
  optionValuesJson: jsonb("option_values_json"),
  weightGrams: integer("weight_grams"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const channelListings = pgTable("channel_listings", {
  id: uuid("id").defaultRandom().primaryKey(),
  variantId: uuid("variant_id")
    .notNull()
    .references(() => variants.id, { onDelete: "cascade" }),
  integrationAccountId: uuid("integration_account_id")
    .notNull()
    .references(() => integrationAccounts.id, { onDelete: "cascade" }),
  platformListingId: text("platform_listing_id"),
  status: text("status"),
  buyabilityStatus: text("buyability_status"),
  issuesJson: jsonb("issues_json"),
  publishedAt: timestamp("published_at", { withTimezone: true }),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const inventoryPositions = pgTable(
  "inventory_positions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    variantId: uuid("variant_id")
      .notNull()
      .references(() => variants.id, { onDelete: "cascade" }),
    integrationAccountId: uuid("integration_account_id")
      .notNull()
      .references(() => integrationAccounts.id, { onDelete: "cascade" }),
    locationKey: text("location_key").notNull(),
    quantityName: text("quantity_name").notNull(),
    quantityValue: integer("quantity_value").notNull().default(0),
    authoritativeSource: text("authoritative_source"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (table) => ({
    inventoryPositionUnique: uniqueIndex("inventory_positions_unique").on(
      table.variantId,
      table.integrationAccountId,
      table.locationKey,
      table.quantityName
    )
  })
);

export const syncJobs = pgTable("sync_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  integrationAccountId: uuid("integration_account_id")
    .notNull()
    .references(() => integrationAccounts.id, { onDelete: "cascade" }),
  jobType: text("job_type").notNull(),
  cursor: text("cursor"),
  state: text("state").notNull().default("pending"),
  retryCount: integer("retry_count").notNull().default(0),
  payloadJson: jsonb("payload_json"),
  errorJson: jsonb("error_json"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});

export const alerts = pgTable("alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  workspaceId: uuid("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  severity: text("severity").notNull(),
  category: text("category").notNull(),
  entityRef: text("entity_ref"),
  sourcePlatform: text("source_platform"),
  payloadJson: jsonb("payload_json"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
