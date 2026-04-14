# SundayStripe — Shopify Theme

Cleveland-based golf brand selling gloves, graphic apparel, and custom golf bag stands.

**Live store:** [sundaystripe.com](https://sundaystripe.com)  
**Shopify store handle:** `4bddb6-b0.myshopify.com`  
**Active theme:** Ride  
**GitHub:** [rebelscum216/SundayStripe](https://github.com/rebelscum216/SundayStripe)

---

## Setup

### Prerequisites
- [Shopify CLI](https://shopify.dev/docs/themes/tools/cli) v3+
- Logged in via `shopify auth login`

### Pull latest theme from store
```
shopify theme pull --store=4bddb6-b0.myshopify.com
```
Select **Ride** (Live theme).

### Push changes to store
```
shopify theme push --store=4bddb6-b0.myshopify.com
```
Select **Ride** (Live theme).

### Preview without pushing live
```
shopify theme dev --store=4bddb6-b0.myshopify.com
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
| `templates/page.golf-stands.json` | Golf Stands page |
| `templates/page.golf-gifts.json` | Golf Gift Ideas (evergreen SEO) |
| `templates/page.golf-gloves-guide.json` | Golf Gloves Guide (evergreen SEO) |
| `templates/page.cleveland-golf.json` | Cleveland Golf Gear (evergreen SEO) |

---

## Workflow

1. Make edits to theme files locally
2. `git add` and `git commit` your changes
3. `shopify theme push` to push live
4. `git push` to sync GitHub

> **Note:** Content managed in Shopify Admin (page copy, collection descriptions, product descriptions, homepage SEO title/meta) does NOT live in these files. Use `shopify theme pull` to sync any admin-side template changes back locally.

---

## Important Admin-Side Tasks (not in theme files)

These need to be managed directly in [Shopify Admin](https://admin.shopify.com):

- **Homepage SEO** — Online Store → Preferences → Title & meta description
- **Collection descriptions** — Products → Collections → [each collection] → Description
- **Evergreen page creation** — Online Store → Pages → Add page (use templates above)
- **Trump glove page** — Delete it under Online Store → Pages
