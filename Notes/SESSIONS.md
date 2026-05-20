# Session Notes

Session notes are kept locally and not committed to this repo.

## Known Local Dev Issues

- Next.js dev can throw `Error: Cannot find module './904.js'` or another missing `./###.js` chunk from `apps/web/.next/server/webpack-runtime.js` after `next build` and `next dev` have both touched the same `.next` directory. This is stale build output, not a route bug. Fix by stopping the web dev server, running `rm -rf apps/web/.next`, then restarting `pnpm --filter @sunday-stripe/web dev`. Avoid running `pnpm --filter @sunday-stripe/web build` while the dev server is active.

---

## 2026-04-29 (Session 1 — Codex)

### Completed

- Built pnpm monorepo foundation (apps/api, apps/web, packages/db).
- Shopify initial sync working — products, variants, channel_listings, inventory_positions all in Postgres.
- Re-authorized Shopify token with inventory scopes.
- Registered Shopify webhooks (PRODUCTS_UPDATE, PRODUCTS_DELETE, INVENTORY_LEVELS_UPDATE).
- Shopify webhook processor with full re-fetch + upsert behavior on both product and inventory topics.
- Google Merchant Center initial sync — reads products, upserts channel_listings, writes item-level alerts.
- `GET /api/status` endpoint with per-integration health row.
- Next.js dashboard scaffolded with operations status page.

---

## 2026-04-29 (Session 2 — Claude)

### Completed

**Phase 1 wrap-up**
- Verified live Shopify webhook delivery (product title + inventory updates confirmed end-to-end).
- Added auto-refresh to the status dashboard (30s interval via `router.refresh()`).
- Added "Clear failures" button — `DELETE /api/jobs/failed` marks failed sync_jobs as dismissed.
- Fixed "Operational: Yes" bug on the status page (now checks failed jobs too).

**Phase 2 — Dashboard & product catalog**
- `GET /api/products` — products with variant counts, total available inventory, and per-channel listing status (worst status per platform).
- `GET /api/alerts` — open alerts ordered newest-first.
- `/products` page — catalog table with channel badges (published/issue/disapproved/unlisted), inventory totals, clickable titles.
- `/alerts` page — grouped by category, listing issues expand to per-issue detail with severity/description/resolution.
- Nav bar added to layout (Status / Products / Alerts / Search Console).

**Phase 2 — Product detail page**
- `GET /api/products/:id` — full product detail: variants with per-channel listing status, inventory positions grouped by location, open alerts scoped to this product's listings.
- `/products/[id]` page — header with totals, variants table with Shopify/Merchant status columns, inventory by location table (available/committed/on_hand/incoming), open issues section.

**Phase 2 — Search Console integration**
- Added `search_performance` table (migration `0001_search_performance.sql`).
- `GscModule` — OAuth2 user-credential auth via existing token at `~/.config/gsc/token.json`, BullMQ `gsc-sync` queue, sync service fetches 90-day by_query and by_page windows.
- Integers stored as scaled integers (ctr × 100,000, position × 10) to avoid float precision issues.
- `GET /api/search-console/summary`, `/queries`, `/pages` endpoints.
- `seed-gsc.ts` script — creates integration_account and enqueues first sync.
- `/search-console` page — summary metrics, quick-wins panel (positions 5–20), top queries table, top pages table.
- First sync ran: 90 queries, 88 pages from sc-domain:sundaystripe.com.

### Current State

- Three integrations active: Shopify, Google Merchant, Search Console.
- API at `http://localhost:3001`, web at `http://localhost:3000`.
- All four dashboard pages working: Status, Products, Alerts, Search Console.
- 33 products, 413 variants synced from Shopify.
- GSC 90-day data in DB (90 queries, 88 pages).

### Session 3 Additions — Codex

- Fixed product detail variants to show size from Shopify selected options.
  - Shopify sync and webhook re-fetch now persist `selectedOptions` in `variants.option_values_json`.
  - `/api/products/:id` exposes `variant.size`.
  - `/products/[id]` renders a Size column.
- Added local-only Shopify location display-name mapping for inventory location labels.
  - `SHOPIFY_LOCATION_NAME_MAP` can map Shopify location GIDs or numeric IDs to friendly names.
  - Real store location names stay in local `.env`, not public code.
- Added scheduled Search Console re-sync.
  - `GscSchedulerService` runs daily at 3am.
  - It creates `gsc_initial_sync` rows for all `search_console` integrations and enqueues BullMQ jobs.
- Added Amazon SP-API listings integration scaffold.
  - `AmazonModule`, `AmazonApiService`, `AmazonSyncService`, `AmazonSyncProcessor`.
  - `seed-amazon.ts` creates/upserts the `amazon_sp` integration and enqueues `amazon_initial_sync`.
  - Listing sync matches local variants by SKU, upserts `channel_listings`, and writes/resolves `listing_issue` alerts.
  - API build passes; seed was not run because local `.env` is missing `AMAZON_SELLER_ID`.

### Current State

- Four backend integration modules exist: Shopify, Google Merchant, Search Console, Amazon SP-API.
- Active verified data sources: Shopify, Google Merchant, Search Console.
- Amazon module compiles and boots, but still needs `AMAZON_SELLER_ID` added locally before first seed/sync.
- Dashboard pages working: Status, Products, Product Detail, Alerts, Search Console.
- Product detail now shows variant sizes and supports friendly inventory location names from local env.

---

## 2026-04-30 (Session 4 — Claude + Codex)

### Completed — Claude

**Products page**
- `ProductsTable` client component with text search (title + SKU) and status dropdown filter.
- Channel coverage gap chips: "N not on Merchant / Amazon" — clickable to filter the list.
- Attribute completeness gap chips: "N missing Brand / Barcode / Description" — amber styled, clickable.
- Per-row completeness indicator (amber badge with count, hover shows which attributes).
- API: `hasBarcode` (`bool_or`) and `hasDescription` (length check) computed server-side in `GET /api/products`.

**Product detail page**
- `GET /api/products/:id/gsc` endpoint — derives Shopify handle from title, queries `search_performance` for matching pages + queries.
- GSC section on detail page: Landing Pages table + Search Queries table when data exists.
- Missing attributes banner: lists title/brand/barcode/description gaps with fix guidance.
- Revenue widget: `GET /api/products/:id/revenue` — 90-day totals + top variants breakdown. Shows in header stat row (green) and as a full panel with per-variant table.
- AI copy generator: "Generate copy with AI" button calls `POST /api/ai/describe-product`, returns Description + SEO Title + SEO Meta Description, each with copy-to-clipboard.

**Alerts page**
- Dismiss button on every alert card (`PATCH /api/alerts/:id/resolve`).
- "What does this mean? →" AI explainer on every alert card — calls `POST /api/ai/explain-alert`, returns plain-English summary + numbered fix steps. Per-card loading state, collapsible.

**Status page**
- `POST /api/integrations/:id/sync` endpoint — creates sync_job + enqueues to correct BullMQ queue by platform.
- "Sync Now" button per integration row. Shows "Syncing…" while pending_jobs > 0.

**Cross-channel page**
- `GET /api/cross-channel` — joins products × revenue × GSC × channel coverage, assigns flags: `no_revenue` (100+ GSC impressions, $0 revenue), `opportunity` (revenue but not on Amazon), `no_listing` (revenue but not on Merchant).
- `/cross-channel` page with flag summary cards + full sortable table. Linked from nav.

**AI infrastructure**
- `openai` package installed in `apps/api`.
- `POST /api/ai/describe-product` — feeds title, brand, description, GSC queries to `gpt-4o-mini`, returns JSON copy.
- `POST /api/ai/explain-alert` — feeds platform, category, issues array to `gpt-4o-mini`, returns summary + fixes.
- Next.js `/api-proxy/[...path]` catch-all route — forwards client-side fetch calls to NestJS, keeps OpenAI key server-side.

**Merchant matching fix**
- `findLocalVariantId` in `MerchantSyncService` now falls back to GID matching for `shopify_US_{productId}_{variantLegacyId}` offer IDs.

### Completed — Codex

- `GscSchedulerService` — `@Cron('0 3 * * *')` daily re-sync for all `search_console` integrations.
- `AmazonModule` — full listings sync pipeline (AmazonApiService, AmazonSyncService, AmazonSyncProcessor, seed-amazon.ts). Needs `AMAZON_SELLER_ID` in `.env` before first run.
- Shopify orders sync — `orders` + `order_line_items` tables (migration `0002_orders.sql`), `ShopifyOrdersSyncService` (REST API, 90-day window, cursor pagination, price→cents), processor, module wiring.
- `GET /api/revenue` — products sorted by 90-day revenue.
- `GET /api/cross-channel` — full three-query join (revenue + channels + GSC), flag logic, JS assembly.
- `seed-orders.ts` — enqueues `shopify_orders_sync` job.

### Current State

- Five integration modules: Shopify (products + webhooks + orders), Google Merchant, Search Console, Amazon SP-API.
- Active data: Shopify products/variants/inventory, GMC listings/alerts, GSC 90-day pages/queries.
- Orders table exists; needs `seed-orders.ts` run to populate revenue data.
- Amazon needs `AMAZON_SELLER_ID` in `.env` before first sync.
- Dashboard pages: Status, Products, Alerts, Search Console, Product Detail, Cross-Channel.
- AI features live: copy generator on product detail, alert explainer on alerts page.
- Deployment target decided: Vercel (web) + Railway (API + Postgres + Redis).
- Pre-deploy blocker: GSC token file (`~/.config/gsc/token.json`) must move to an env var.

### Seeds to run when ready

```bash
cd packages/db && npx tsx migrate.ts                    # apply 0002_orders migration
cd apps/api && npx tsx src/scripts/seed-orders.ts       # populate 90-day revenue
cd apps/api && npx tsx src/scripts/seed-amazon.ts       # after adding AMAZON_SELLER_ID to .env
```

### Next priorities

1. **Run orders seed + verify revenue** — cross-channel page needs live data to be useful.
2. **Amazon `AMAZON_SELLER_ID`** — add to `.env`, run seed, verify channel_listings created.
3. **GSC token → env var** — required before Railway deploy. Move token file contents into `GSC_TOKEN_JSON` env var.
4. **SEO metafields** — Codex task: fetch `global.title_tag` + `global.description_tag` from Shopify REST, store in products table. Feeds into AI generator.
5. **Amazon listing quality score** — Codex task: score ASIN on title length, bullets, description, images (spec in DASHBOARD_SPEC.md).
6. **Deploy to Vercel + Railway** — once orders + Amazon are verified locally.

### Local-Only Files (do not commit)

- `.env`
- `.streamlit/secrets.toml`
- `CODEX_HANDOFF.md`
- `SESSIONS.md`
- `deep-research-report-3.md`
- `scripts/.shopify/`

---

## 2026-04-30 (Session 5 — Codex)

### Completed

**Deploy prep**
- Added production env guidance to `.env.example` for `WEB_APP_URL`, `GSC_TOKEN_JSON`, and `API_BASE_URL`.
- Added `start:prod` script to `apps/api/package.json`.
- Added `DEPLOY.md` with concise Railway (API/Postgres/Redis) and Vercel (web) setup steps.

**Shopify SEO metafields**
- Added `products.seo_title` and `products.seo_description`.
- Added migration `0003_seo_metafields.sql` and registered it in `packages/db/migrate.ts`.
- Updated Shopify initial sync and webhook re-fetch to read `global.title_tag` and `global.description_tag`.
- Fixed Shopify GraphQL metafield query shape from `metafields(identifiers: ...)` to singular aliases:
  - `seoTitleMetafield: metafield(namespace: "global", key: "title_tag")`
  - `seoDescriptionMetafield: metafield(namespace: "global", key: "description_tag")`
- Re-ran Shopify seed/sync. Verification returned `33` products total and `4` with non-null `seo_title`.
- Product detail page now shows current Shopify SEO metafields when present.
- AI copy generator prompt now includes existing SEO title/meta description context.

**Orders/revenue/cross-channel fixes**
- Fixed `/api/revenue`, `/api/cross-channel`, and `/api/products/:id/revenue` date filters to use `now() - interval '90 days'` instead of passing JS `Date` into raw Drizzle SQL fragments.
- Confirmed `/api/cross-channel` returns product rows.
- `/api/revenue` may still return empty until Shopify order sync has successful order data.

**Products UX**
- Dashboard metric cards are now clickable:
  - Products/Variants -> `/products`
  - Open Alerts and Alert Load -> `/alerts`
  - Integration alert counts -> `/alerts`
- Products list now tracks `seo_title` as a missing attribute.
- Added "SEO Title" gap chip label and included `seo_title` in aggregate gap chips.
- Added "Low Amazon Quality (<50)" amber gap chip for products with `amazonQualityScore < 50`.
- Fixed a pre-existing `ProductsTable` reduce typing issue.

**Cross-channel**
- Added `amazonQualityScore` to `GET /api/cross-channel`.
- Cross-channel table now includes an `AQ Score` column and reuses `QualityScoreBadge`.
- Added row-level AI Cross-Channel Opportunity Explainer:
  - Backend: `POST /api/ai/cross-channel-opportunity`
  - Frontend: `/cross-channel` row-level **Explain** button
  - Returns summary, likely cause, next best action, expected upside, and fixes.

**AI features**
- Next.js `/api-proxy/[...path]` route is implemented for client-side calls into NestJS.
- Product detail AI tools now include:
  - Copy & SEO generator (`POST /api/ai/describe-product`)
  - Product Fix Assistant (`POST /api/ai/product-fix-assistant`)
  - Amazon Listing Rewrite (`POST /api/ai/amazon-listing-rewrite`)
- Alerts page has per-alert explainer (`POST /api/ai/explain-alert`).
- Cross-channel page has per-row opportunity explainer (`POST /api/ai/cross-channel-opportunity`).

### Current State

- Core app is running locally with Next.js dashboard and NestJS API.
- Active product catalog: 33 products, 413 variants.
- Shopify SEO metafields are partially populated (`4/33` products currently have `seo_title`).
- Cross-channel page is useful with GSC/channel flags, but revenue depends on successful Shopify orders sync.
- AI is implemented as recommendation/copy generation only; no AI-generated changes are written back to Shopify, Merchant Center, or Amazon.
- Amazon SP-API code exists and an integration row exists locally, but Amazon sync/quality coverage should still be treated as partially verified until credentials and sync results are confirmed.

### Verification Run This Session

```bash
cd packages/db && npx tsc -p tsconfig.json
cd apps/api && npx tsc -p tsconfig.json --noEmit
cd apps/web && npx tsc -p tsconfig.json --noEmit
cd apps/api && npx tsx src/scripts/seed-shopify.ts
```

SEO sync verification:

```sql
SELECT count(*) as total, count(seo_title) as has_seo FROM products;
-- total: 33, has_seo: 4
```

### Next Priorities

1. **Verify AI flows manually with `OPENAI_API_KEY` set** — product detail copy, fix assistant, Amazon rewrite, alert explainer, and cross-channel explainer.
2. **Run/verify Shopify orders sync** — ensure `/api/revenue` has rows and Cross-Channel revenue flags become revenue-aware.
3. **Finish Amazon sync verification** — resolve local Amazon failed jobs, confirm listings/quality scores/alerts are current.
4. **Add AI suggestion persistence** — store generated recommendations so the same product does not need repeated model calls.
5. **Build Alert Triage Queue** — group open alerts by root cause and generate batch fix plans.
6. **Add human-in-the-loop apply flows** — reviewed diffs for Shopify SEO/content first; Amazon/Merchant writeback later.

---

## 2026-05-01 (Session 6 — Codex + Claude)

### Completed — Codex (ran out of usage mid-session)

**Per-variant barcode inline fix — backend**
- Added `getVariantTitle(optionValuesJson, fallbackSku)` helper that formats Shopify `selectedOptions` into a human-readable label (e.g. `Size: S / Color: Red`); falls back to SKU.
- Added `title` field (via `getVariantTitle`) to variant rows returned by `GET /api/products/:id`.
- Added `PATCH /api/products/:id/variants/:variantId/barcode` endpoint:
  - Validates variant belongs to product.
  - Pushes barcode to Shopify via `productVariantsBulkUpdate` mutation.
  - Updates `variants.barcode` in local DB.
  - Queues Merchant Center + Amazon SP-API re-sync jobs.
  - Returns `{ ok, variantId, sku, barcode, pushed, queued, message }`.
- Added `updateShopifyVariantFields(workspaceId, productId, optionValuesJson, fields)` private helper used by the new endpoint (and extracted to reuse for future variant-level field pushes).

### Completed — Claude (picked up after Codex ran out)

**Per-variant barcode inline fix — frontend**
- Added `VariantBarcodeRow` sub-component to `missing-attribute-fix.tsx`:
  - Shows SKU + variant option title (e.g. `SKU-001-S  Size: S`) above the input row.
  - Per-row state machine: `idle → saving → saved/error`.
  - Calls `PATCH /api-proxy/products/:productId/variants/:variantId/barcode`.
  - Shows server-returned message on success; shows red error text on failure.
  - Input + button disable after successful save.
- Wired `MissingAttributeFix` to render the per-variant flow when `attribute === "barcode"` and variants are passed in (falls through to original brand flow / "Open fix tools" otherwise).
- Updated `Variant` type in `page.tsx` to include `title: string`.
- Changed barcode missing-attribute detection in `page.tsx` to filter `variants` to those missing barcodes and pass them as `variants` prop to `MissingAttributeFix`.

### Current State

- Six sessions complete. Core hub is fully functional locally.
- Two inline apply flows live: **brand** (product-level) and **barcode** (per-variant with option titles).
- AI tools live (read-only generation): copy/SEO, fix assistant, Amazon listing rewrite, alert explainer, cross-channel explainer.
- Revenue data blocked: orders seed not run yet (`seed-orders.ts`).
- Amazon blocked: `AMAZON_SELLER_ID` not yet in `.env`.
- Deployment files exist (`DEPLOY.md`, `railway.json`, `vercel.json`, API `Dockerfile`) but deploy not attempted.

### Seeds still to run

```bash
cd packages/db && npx tsx migrate.ts                    # if any migrations pending
cd apps/api && npx tsx src/scripts/seed-orders.ts       # populate 90-day revenue
cd apps/api && npx tsx src/scripts/seed-amazon.ts       # after adding AMAZON_SELLER_ID to .env
```

### Next Priorities

1. **Run orders seed + verify revenue** — `/api/revenue` and cross-channel revenue flags need live data.
2. **Amazon `AMAZON_SELLER_ID`** — add to `.env`, run seed, verify `channel_listings` Amazon rows and quality scores.
3. **Inline fix flows — SEO title/meta** — extend `MissingAttributeFix` or add a new component for `seo_title` attribute; calls existing `PATCH /api/products/:id/attributes` (already handles `brand`, easy to extend).
4. **Inline fix flow — description** — product-level text area with `PATCH /api/products/:id/attributes`, plain text or basic HTML.
5. **AI suggestion persistence** — `ai_recommendations` table; avoid repeated model calls for unchanged context.
6. **Deploy** — Railway (API + Postgres + Redis) + Vercel (web). GSC token must be in `GSC_TOKEN_JSON` env var.
