# Session Notes

---

## Session 1 — 2026-04-14

### What we did

**Project setup**
- Initialized git repo in `/Users/andrewsmith/SundayStripe`
- Connected to GitHub remote: `https://github.com/rebelscum216/SundayStripe.git`
- Pulled live theme ("Ride") from `4bddb6-b0.myshopify.com` using Shopify CLI
- Initial commit: 311 theme files

**SEO improvements (all 5 priorities from SEOideas.md)**

1. **Homepage title & meta** — Can't edit from theme files; needs to be set in Shopify Admin → Online Store → Preferences. Suggested copy:
   - Title: `Golf Gloves, Graphic Tees & Golf Hoodies | Sunday Stripe`
   - Meta: `Shop Sunday Stripe for golf gloves, graphic golf tees, golf hoodies, and custom golf stands. Cleveland-designed golf gear for the course and the couch.`

2. **Collection intro copy** — Enabled `show_collection_description` in `templates/collection.json`. Copy needs to be added in Admin → Products → Collections for: Golf Gloves, Golf Apparel, Hoodies & Sweatshirts. Copy written and ready in this session.

3. **About page** (`templates/page.about.json`) — Full rewrite with founder story (Andrew Smith, Cleveland), explains gloves vs made-to-order apparel, covers the local golf stands business, removed political disclaimer.

4. **Contact page** (`templates/page.contact.json`) — Added FAQ section below the form covering: response time, shipping times, Amazon availability, 30-day return policy, golf stand ordering, custom logos. Public email: support@sundaystripe.com.

5. **Golf Stands page** (`templates/page.golf-stands.json`) — Added SEO-focused intro section at top targeting "custom golf bag stands Cleveland." Updated Additional Info with turnaround time (~2 weeks), delivery area (Cleveland + suburbs for fee), no shipping available.

6. **Evergreen content pages** — Three new templates created. Need to be activated by creating matching pages in Shopify Admin → Online Store → Pages:

| Template | Page Title | URL Handle |
|---|---|---|
| `page.golf-gifts.json` | Golf Gift Ideas for Him | `golf-gifts` |
| `page.golf-gloves-guide.json` | What Makes a Good Golf Glove | `golf-gloves-guide` |
| `page.cleveland-golf.json` | Cleveland Golf Gear & Apparel | `cleveland-golf` |

**Cleanup**
- Deleted `templates/page.trump-glove.json` (experiment that never launched)
- Still need to delete the Trump glove page in Shopify Admin → Online Store → Pages

### Remaining admin-side tasks
- [ ] Set homepage title & meta in Admin → Online Store → Preferences
- [ ] Add collection descriptions for Golf Gloves, Golf Apparel, Hoodies
- [ ] Create the 3 evergreen pages in Admin and assign templates
- [ ] Delete Trump glove page in Admin → Online Store → Pages

### Brand notes
- Founded by Andrew Smith, Cleveland OH
- Gloves: made in batches, in stock, ship 1–2 days, also on Amazon
- Apparel: made to order, ships 7–10 business days
- Golf stands: local only (Cleveland + suburbs), ~2 week turnaround, pickup or delivery
- No political affiliations
- Returns: 30 days, unused/original condition, contact support@sundaystripe.com
