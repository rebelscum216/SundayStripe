# Sunday Stripe

Sunday Stripe is moving toward a Next.js + NestJS commerce operations hub. The
existing Shopify theme, Streamlit dashboard, and Python scripts remain in this
repo as reference material, but Phase 1 development happens in the pnpm
monorepo under `apps/` and `packages/`.

## Phase 1 Setup

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker Desktop or another Docker Compose runtime

### Local Development

```bash
pnpm install
docker compose up -d
pnpm migrate
pnpm dev
```

The development servers run at:

- Web: `http://localhost:3000`
- API: `http://localhost:3001/api/status`

### Environment

Copy `.env.example` to `.env` and fill in real Shopify credentials when you
begin OAuth work. The default local Postgres and Redis URLs match
`docker-compose.yml`.

## Monorepo Structure

```text
apps/
  api/       NestJS API, Drizzle/Postgres connection, BullMQ/Redis wiring
  web/       Next.js 14 app with TypeScript and Tailwind CSS
packages/
  db/        Shared Drizzle schema and migration runner
```

Useful root scripts:

- `pnpm dev` starts the API and web apps.
- `pnpm build` builds the shared db package, API, and web app.
- `pnpm migrate` applies database migrations to Postgres.

## Shopify Theme Reference

The original theme instructions are preserved below.

---

# Example Golf Brand — Shopify Theme

A sample Shopify theme for a golf apparel and lifestyle storefront.

**Live store:** [example.com](https://example.com)  
**Shopify store handle:** `your-store.myshopify.com`  
**Active theme:** Ride  
**GitHub:** [owner/repo](https://github.com/owner/repo)

---

## Setup

### Prerequisites
- [Shopify CLI](https://shopify.dev/docs/themes/tools/cli) v3+
- Logged in via `shopify auth login`

### Pull latest theme from store
```
shopify theme pull --store=your-store.myshopify.com
```
Select **Ride** (Live theme).

### Push changes to store
```
shopify theme push --store=your-store.myshopify.com
```
Select **Ride** (Live theme).

### Preview without pushing live
```
shopify theme dev --store=your-store.myshopify.com
```

---

## Project Structure

```
/assets         — CSS and JS files
/blocks         — Custom Liquid blocks
/config         — Theme settings (settings_data.json, settings_schema.json)
/layout         — Master layout (theme.liquid, password.liquid)
/locales        — Translation strings
/sections       — Page sections (header, footer, product grid, etc.)
/snippets       — Reusable Liquid components
/templates      — Page templates (JSON)
```

### Key templates
| File | Page |
|---|---|
| `templates/index.json` | Homepage |
| `templates/page.about.json` | About page |
| `templates/page.contact.json` | Contact page |
| `templates/page.{slug}.json` | Custom page (add as needed) |

---

## Workflow

1. Make edits to theme files locally
2. `git add` and `git commit` your changes
3. `shopify theme push` to push live
4. `git push` to sync GitHub

> **Note:** Content managed in Shopify Admin (page copy, collection descriptions, product descriptions, homepage SEO title/meta) does NOT live in these files. Use `shopify theme pull` to sync any admin-side template changes back locally.

---

## Admin-Side Notes

Some content is managed in Shopify Admin and does not live in these theme files:

- **Homepage SEO** — Online Store → Preferences → Title & meta description
- **Collection descriptions** — Products → Collections → [each collection] → Description
- **Evergreen pages** — Online Store → Pages → Add page (assign templates from `templates/` above)
