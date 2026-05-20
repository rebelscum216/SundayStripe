# Phase 1: Foundation + Shopify Sync

## Goal

Stand up the core infrastructure for the e-commerce hub: project scaffold, database schema, Shopify OAuth, full product/inventory initial sync, webhook ingestion, and a job queue. No other integrations yet. No real UI beyond a status endpoint.

Done means: a Shopify store is connected, all products and inventory are in Postgres, webhook events are flowing and updating local state, and a status API route confirms the pipeline is healthy.

---

## Stack Decision

| Layer | Choice | Replaces |
|---|---|---|
| Frontend | Next.js 14+ (TypeScript, App Router) | Streamlit dashboard |
| API | NestJS (TypeScript) | Ad-hoc Python scripts |
| Database | Postgres (via Drizzle ORM or Prisma) | None |
| Queue | BullMQ (Redis-backed) | None |
| Cache / locks | Redis | None |
| Local dev | Docker Compose | None |

The existing `dashboard/` Streamlit app and `scripts/` are reference material only. Do not extend them.

---

## Repo Structure

```
/
├── apps/
│   ├── web/          # Next.js frontend
│   └── api/          # NestJS backend
├── packages/
│   └── db/           # Shared Drizzle schema + migrations
├── docker-compose.yml
├── .env.example
└── PHASE_1.md
```

Use a pnpm monorepo (`pnpm-workspace.yaml`).

---

## Environment Variables

```env
# Postgres
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/hub

# Redis
REDIS_URL=redis://localhost:6379

# Shopify App (from Partners dashboard)
SHOPIFY_API_KEY=
SHOPIFY_API_SECRET=
SHOPIFY_SCOPES=read_products,write_products,read_inventory,write_inventory
SHOPIFY_APP_URL=http://localhost:3001   # API base URL for OAuth redirect

# Encryption key for stored tokens (32-byte hex)
TOKEN_ENCRYPTION_KEY=

# App
NODE_ENV=development
```

Existing `.env.example` credentials (Google, Amazon) carry forward to later phases — do not delete them.

---

## Task 1 — Project Scaffold

**Owner: Codex**

- [ ] Init pnpm monorepo with `apps/web`, `apps/api`, `packages/db`
- [ ] `apps/api`: NestJS app with `ConfigModule`, `TypeOrmModule` or Drizzle wired to Postgres, BullMQ module wired to Redis
- [ ] `apps/web`: Next.js 14 app with TypeScript, Tailwind CSS
- [ ] `docker-compose.yml`: services for `postgres` (port 5432) and `redis` (port 6379)
- [ ] Root `package.json` scripts: `dev`, `build`, `migrate`
- [ ] `.env.example` updated with all vars above
- [ ] `README.md` with setup steps: `pnpm install` → `docker compose up -d` → `pnpm migrate` → `pnpm dev`

**Acceptance:** `pnpm dev` starts both apps without errors. Postgres and Redis reachable from API.

---

## Task 2 — Database Schema

**Owner: Codex**

Create the following tables as a Drizzle (or Prisma) schema in `packages/db/schema.ts`. Run initial migration.

### `workspaces`
```
id            uuid PK default gen_random_uuid()
name          text NOT NULL
plan          text NOT NULL default 'free'
default_currency  text NOT NULL default 'USD'
timezone      text NOT NULL default 'America/New_York'
created_at    timestamptz NOT NULL default now()
```

### `integration_accounts`
```
id                    uuid PK
workspace_id          uuid FK → workspaces.id NOT NULL
platform              text NOT NULL   -- 'shopify' | 'merchant' | 'search_console' | 'amazon_sp'
external_account_id   text           -- Shopify shop domain, Merchant account ID, etc.
shop_domain           text           -- Shopify only
region                text
marketplace_id        text           -- Amazon only
status                text NOT NULL default 'active'  -- 'active' | 'error' | 'disconnected'
scopes_json           jsonb
encrypted_access_token  text
encrypted_refresh_token text
token_expires_at      timestamptz
last_synced_at        timestamptz
created_at            timestamptz NOT NULL default now()
```

### `products`
```
id                uuid PK
workspace_id      uuid FK → workspaces.id NOT NULL
canonical_sku     text NOT NULL
brand             text
title             text
description_html  text
source_of_truth   text NOT NULL default 'shopify'
source_updated_at timestamptz
created_at        timestamptz NOT NULL default now()
updated_at        timestamptz NOT NULL default now()

UNIQUE (workspace_id, canonical_sku)
```

### `variants`
```
id              uuid PK
product_id      uuid FK → products.id NOT NULL
sku             text NOT NULL
barcode         text
option_values_json  jsonb
weight_grams    integer
created_at      timestamptz NOT NULL default now()
updated_at      timestamptz NOT NULL default now()
```

### `channel_listings`
```
id                    uuid PK
variant_id            uuid FK → variants.id NOT NULL
integration_account_id  uuid FK → integration_accounts.id NOT NULL
platform_listing_id   text    -- Shopify product GID, Merchant offerId, etc.
status                text    -- 'published' | 'disapproved' | 'issue' | 'unlisted'
buyability_status     text
issues_json           jsonb
published_at          timestamptz
last_seen_at          timestamptz
created_at            timestamptz NOT NULL default now()
updated_at            timestamptz NOT NULL default now()
```

### `inventory_positions`
```
id                      uuid PK
variant_id              uuid FK → variants.id NOT NULL
integration_account_id  uuid FK → integration_accounts.id NOT NULL
location_key            text NOT NULL   -- Shopify location GID, 'fba-us', etc.
quantity_name           text NOT NULL   -- 'available' | 'committed' | 'on_hand' | 'incoming'
quantity_value          integer NOT NULL default 0
authoritative_source    text            -- 'shopify' | 'amazon_fba'
updated_at              timestamptz NOT NULL default now()

UNIQUE (variant_id, integration_account_id, location_key, quantity_name)
```

### `sync_jobs`
```
id                      uuid PK
integration_account_id  uuid FK → integration_accounts.id NOT NULL
job_type                text NOT NULL  -- 'shopify_initial_sync' | 'shopify_reconcile' | 'shopify_webhook'
cursor                  text
state                   text NOT NULL default 'pending'  -- 'pending' | 'running' | 'done' | 'failed'
retry_count             integer NOT NULL default 0
payload_json            jsonb
error_json              jsonb
started_at              timestamptz
finished_at             timestamptz
created_at              timestamptz NOT NULL default now()
```

### `alerts`
```
id              uuid PK
workspace_id    uuid FK → workspaces.id NOT NULL
severity        text NOT NULL  -- 'critical' | 'high' | 'info'
category        text NOT NULL  -- 'inventory_drift' | 'listing_issue' | 'sync_lag' | 'connector_error'
entity_ref      text
source_platform text
payload_json    jsonb
status          text NOT NULL default 'open'  -- 'open' | 'resolved'
created_at      timestamptz NOT NULL default now()
```

**Acceptance:** `pnpm migrate` runs without errors. All tables present in Postgres.

---

## Task 3 — Shopify OAuth Flow

**Owner: Claude + Codex**

Implement the standard Shopify OAuth authorization code grant for offline tokens.

### Flow
1. `GET /api/shopify/auth?shop=<shop-domain>` — validate shop param, redirect to Shopify OAuth screen
2. Shopify redirects to `GET /api/shopify/callback?code=...&shop=...&hmac=...&state=...`
3. Verify HMAC signature using `SHOPIFY_API_SECRET`
4. Exchange code for permanent offline access token via `POST https://{shop}/admin/oauth/access_token`
5. Encrypt token with `TOKEN_ENCRYPTION_KEY` (AES-256-GCM), store in `integration_accounts`
6. Create or upsert `workspaces` record if first install
7. Redirect to frontend with success

### Required scopes
`read_products,write_products,read_inventory,write_inventory`

### Notes
- Use `crypto` (Node built-in) for HMAC verification — do not use a third-party Shopify library for this
- Encrypted token must be decryptable at runtime for API calls
- `state` param must be a random nonce verified on callback to prevent CSRF

**Acceptance:** Completing the OAuth flow creates a row in `integration_accounts` with a non-null `encrypted_access_token` and `shop_domain`.

---

## Task 4 — Shopify Initial Product Sync

**Owner: Codex**

After OAuth completes, enqueue a `shopify_initial_sync` job. The worker:

1. Decrypt access token from `integration_accounts`
2. Paginate through all products using Shopify Admin GraphQL cursor-based pagination
3. For each product: upsert `products` and `variants`
4. For each variant: query `inventoryLevel` for all locations, upsert `inventory_positions`
5. For each product: upsert `channel_listings` with `status` derived from Shopify's `publishedAt` and `status` fields
6. Update `sync_jobs.cursor` after each page so the job is resumable
7. Mark job `done` on completion, `failed` with `error_json` on unrecoverable error

### GraphQL query shape (products page)
```graphql
query ProductSync($cursor: String) {
  products(first: 50, after: $cursor) {
    pageInfo { hasNextPage endCursor }
    edges {
      node {
        id
        title
        handle
        status
        publishedAt
        descriptionHtml
        variants(first: 100) {
          edges {
            node {
              id
              sku
              barcode
              weight
              weightUnit
              inventoryItem {
                id
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      location { id name }
                      quantities(names: ["available", "committed", "on_hand", "incoming"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

### Rate limiting
Shopify GraphQL uses cost-based throttling (100 points/sec on standard). Each request must check `extensions.cost.throttleStatus` and back off if `currentlyAvailable < requestedQueryCost`. Use BullMQ job delays or exponential backoff — do not use `sleep` in the hot path.

**Acceptance:** After OAuth, all products, variants, and inventory levels are in Postgres. Re-running the job is idempotent (upserts, not inserts).

---

## Task 5 — Shopify Webhook Ingestion

**Owner: Claude + Codex**

### Register webhooks
After OAuth, register the following webhook subscriptions via GraphQL:

```graphql
mutation {
  webhookSubscriptionCreate(
    topic: PRODUCTS_UPDATE
    webhookSubscription: {
      callbackUrl: "https://<SHOPIFY_APP_URL>/api/shopify/webhooks"
      format: JSON
    }
  ) { ... }
}
```

Topics to register: `PRODUCTS_UPDATE`, `PRODUCTS_DELETE`, `INVENTORY_LEVELS_UPDATE`

### Inbound handler (`POST /api/shopify/webhooks`)
1. Verify `X-Shopify-Hmac-SHA256` header against raw request body using `SHOPIFY_API_SECRET`
   - Return `401` immediately if invalid — do not process
2. Return `200` immediately after HMAC check — do not block on processing
3. Enqueue a `shopify_webhook` job with `{ topic, shop_domain, payload }`

### Webhook worker
- For `PRODUCTS_UPDATE`: re-fetch the product via GraphQL (do not trust webhook payload as authoritative), upsert `products`, `variants`, `channel_listings`
- For `INVENTORY_LEVELS_UPDATE`: re-fetch inventory levels for the affected `inventory_item_id`, upsert `inventory_positions`
- For `PRODUCTS_DELETE`: mark `channel_listings.status = 'unlisted'` for all listings matching the Shopify product GID

### Dead-letter queue
Failed webhook jobs after 3 retries go to a DLQ. Create an `alerts` row with `category = 'sync_lag'` when a job lands in the DLQ.

**Acceptance:** Editing a product title in Shopify → webhook fires → product title updated in Postgres within 30 seconds. Adjusting inventory in Shopify → `inventory_positions` updated.

---

## Task 6 — Status API Endpoint

**Owner: Codex**

`GET /api/status` — no auth required for Phase 1.

Response shape:
```json
{
  "ok": true,
  "integrations": [
    {
      "platform": "shopify",
      "shop_domain": "example.myshopify.com",
      "status": "active",
      "last_synced_at": "2026-04-29T14:00:00Z",
      "product_count": 842,
      "variant_count": 2104,
      "pending_jobs": 0,
      "failed_jobs": 0,
      "open_alerts": 2
    }
  ]
}
```

**Acceptance:** Endpoint returns valid JSON. Counts match database state.

---

## What Is Explicitly Out of Scope for Phase 1

- Merchant Center, Search Console, Amazon SP-API integrations
- Any frontend UI beyond what Next.js scaffolds by default
- Bulk edit, approval workflows, diff preview
- AI layer (scoring, suggestions, repricing)
- RBAC / multi-user permissions
- Multi-workspace / multi-store support
- Price tracking
- Analytics views

---

## Definition of Done

- [ ] `docker compose up -d && pnpm migrate && pnpm dev` works from a clean clone
- [ ] Shopify OAuth flow completes and stores encrypted token
- [ ] Initial sync populates `products`, `variants`, `channel_listings`, `inventory_positions`
- [ ] `products/update` and `inventory_levels/update` webhooks update Postgres within 30s
- [ ] `GET /api/status` returns accurate counts and job health
- [ ] No plaintext tokens committed or logged anywhere
- [ ] All sync jobs are idempotent (safe to re-run)
