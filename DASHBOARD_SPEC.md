# Shopify + Amazon Analytics Dashboard — Technical Specification

## Overview

A local Streamlit dashboard that pulls live data from Google Search Console, Shopify Admin API, and Amazon SP-API and presents it in a unified view. Runs on `localhost:8501`. No deployment required.

---

## File Structure

```
your-project/
├── .env                          # All credentials (never commit)
├── dashboard/
│   ├── app.py                    # Streamlit entry point
│   ├── data/
│   │   ├── gsc.py                # GSC data loader
│   │   ├── shopify.py            # Shopify data loader
│   │   └── amazon.py             # Amazon SP-API data loader
│   ├── cache/                    # Auto-created, JSON cache files
│   │   ├── gsc_cache.json
│   │   ├── shopify_cache.json
│   │   └── amazon_cache.json
│   └── pages/
│       ├── overview.py
│       ├── seo.py
│       ├── amazon.py
│       ├── shopify.py
│       └── cross_channel.py
└── scripts/                      # Optional CLI scripts
    ├── gsc_analysis.py
    ├── shopify_seo_update.py
    └── amazon_analysis.py
```

---

## Environment Variables

All credentials live in `.env` at the project root. Load with:

```python
import os

ENV_FILE = os.path.join(os.path.dirname(__file__), '..', '.env')
env = {}
with open(ENV_FILE) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()
```

### Key names

See `.env.example` for the full list of required variables. Required keys:

```
# Shopify
SHOPIFY_SHOP=your-store.myshopify.com
SHOPIFY_API_KEY=your-api-key
SHOPIFY_API_SECRET=your-api-secret

# Google Search Console
GSC_CREDENTIALS=~/path/to/client_secret.json
GSC_TOKEN=~/.config/gsc/token.json
GSC_SITE=sc-domain:your-domain.com

# Amazon SP-API
AMAZON_CLIENT_ID=amzn1.application-oa2-client.xxx
AMAZON_CLIENT_SECRET=xxx
AMAZON_REFRESH_TOKEN=Atzr|xxx
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
AMAZON_REGION=us-east-1
AWS_ACCESS_KEY_ID=xxx
AWS_SECRET_ACCESS_KEY=xxx
```

Shopify access token is stored separately:
```
~/.config/shopify/token.json → { "shop": "your-store.myshopify.com", "access_token": "shpat_xxx" }
```

---

## Data Source 1: Google Search Console

### Authentication

Uses saved OAuth2 token. Token auto-refreshes. Never requires browser login after first run.

```python
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES     = ["https://www.googleapis.com/auth/webmasters.readonly"]
TOKEN_FILE = os.path.expanduser("~/.config/gsc/token.json")
SECRETS_FILE = env["GSC_CREDENTIALS"]  # path to client_secret JSON
SITE       = env["GSC_SITE"]           # e.g. "sc-domain:your-domain.com"

def get_gsc_service():
    creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("searchconsole", "v1", credentials=creds)
```

### Query structure

```python
service.searchanalytics().query(
    siteUrl=SITE,
    body={
        "startDate": "2025-01-01",   # YYYY-MM-DD
        "endDate":   "2025-03-31",
        "dimensions": ["page"],       # "page" | "query" | "date" | "device" | "country"
        "rowLimit":   500,
        "dataState":  "final",        # excludes partial data
    }
).execute()
```

### Response shape

```python
{
  "rows": [
    {
      "keys": ["https://your-domain.com/products/..."],  # matches dimensions order
      "clicks": 13,
      "impressions": 387,
      "ctr": 0.0336,       # multiply by 100 for %
      "position": 7.1      # average position (1 = top)
    },
    ...
  ]
}
```

### Data loader — `dashboard/data/gsc.py`

Implement these functions. Cache results to `cache/gsc_cache.json` with a timestamp. Only re-fetch if cache is older than 24 hours or if `force_refresh=True`.

```python
def get_site_summary(days=90) -> dict:
    """
    Returns: { clicks, impressions, avg_ctr, avg_position }
    Query dimensions=["date"], sum across all rows.
    """

def get_pages(days=90) -> list[dict]:
    """
    Returns list of:
    { url, clicks, impressions, ctr, position }
    Query dimensions=["page"], rowLimit=500.
    Strip the site domain prefix from url.
    """

def get_queries(days=90) -> list[dict]:
    """
    Returns list of:
    { query, clicks, impressions, ctr, position }
    Query dimensions=["query"], rowLimit=500.
    """

def get_quick_wins(days=90) -> list[dict]:
    """
    Filter get_pages() where position >= 5 AND position <= 20
    AND impressions >= 100. Sort by impressions desc.
    """

def get_low_ctr_pages(days=90) -> list[dict]:
    """
    Filter get_pages() where impressions >= 500 AND ctr < 0.03.
    Sort by impressions desc.
    """

def get_branded_split(days=90) -> dict:
    """
    From get_queries(), split on whether query contains
    your brand name (configure in .env as BRAND_NAME).
    Returns: {
      branded:    { clicks, impressions },
      nonbranded: { clicks, impressions }
    }
    """

def get_page_query_map(days=90) -> list[dict]:
    """
    Query dimensions=["page","query"], rowLimit=500.
    Returns list of { url, query, clicks, impressions, ctr, position }
    Used for cross-channel tab.
    """
```

---

## Data Source 2: Shopify Admin API

### Authentication

Access token is permanent (offline token). Never expires.

```python
import json, requests

with open(os.path.expanduser("~/.config/shopify/token.json")) as f:
    creds = json.load(f)

SHOP    = creds["shop"]          # "your-store.myshopify.com"
TOKEN   = creds["access_token"]  # "shpat_xxx"
VERSION = "2026-04"
BASE    = f"https://{SHOP}/admin/api/{VERSION}"
HEADERS = {
    "X-Shopify-Access-Token": TOKEN,
    "Content-Type": "application/json"
}
```

### Key endpoints

#### Products
```
GET /admin/api/2026-04/products.json
Params: limit=250, status=active
```
Response shape:
```python
{
  "products": [
    {
      "id": 123456789,
      "title": "Your Product Name",
      "handle": "your-product-handle",    # used in URL: /products/{handle}
      "status": "active",
      "body_html": "<p>Description...</p>",
      "variants": [
        {
          "id": 123,
          "price": "29.99",
          "inventory_quantity": 15,
          "sku": "YOUR-SKU-001"
        }
      ],
      "images": [ { "src": "https://..." } ]
    }
  ]
}
```

#### Product SEO metafields
```
GET /admin/api/2026-04/products/{id}/metafields.json
Params: namespace=global
```
Response shape:
```python
{
  "metafields": [
    {
      "id": 456,
      "namespace": "global",
      "key": "title_tag",          # SEO title
      "value": "Your SEO Title | Store Name",
      "type": "single_line_text_field"
    },
    {
      "namespace": "global",
      "key": "description_tag",    # SEO meta description
      "value": "Your meta description..."
    }
  ]
}
```

#### Collections
```
GET /admin/api/2026-04/custom_collections.json
GET /admin/api/2026-04/smart_collections.json
Params: limit=250
```
Same metafield pattern as products.

#### Pages
```
GET /admin/api/2026-04/pages.json
Params: limit=250
```
Same metafield pattern.

#### Orders (for revenue data)
```
GET /admin/api/2026-04/orders.json
Params:
  status=any
  created_at_min=2025-01-01T00:00:00Z
  created_at_max=2025-03-31T23:59:59Z
  limit=250
  fields=id,created_at,total_price,line_items
```
Response shape:
```python
{
  "orders": [
    {
      "id": 789,
      "created_at": "2025-02-14T10:23:00-05:00",
      "total_price": "59.98",
      "line_items": [
        {
          "product_id": 123456789,
          "title": "Your Product Name",
          "quantity": 2,
          "price": "29.99",
          "sku": "YOUR-SKU-001"
        }
      ]
    }
  ]
}
```
Note: paginate with `page_info` cursor if order count > 250.

### Data loader — `dashboard/data/shopify.py`

```python
def get_products() -> list[dict]:
    """
    Returns all active products with SEO metafields merged in.
    Each item: {
      id, title, handle, status, url (/products/{handle}),
      variant_count, total_inventory, price_min, price_max,
      seo_title (from global.title_tag metafield or None),
      seo_description (from global.description_tag metafield or None),
      image_count
    }
    Fetch products, then for each fetch metafields.
    Cache to shopify_cache.json, TTL 1 hour.
    """

def get_revenue_by_product(days=30) -> list[dict]:
    """
    Fetch orders for last {days} days.
    Aggregate line_items by product_id.
    Returns list of {
      product_id, title, units_sold, revenue
    } sorted by revenue desc.
    """

def get_collections() -> list[dict]:
    """
    Returns all collections (custom + smart) with SEO metafields.
    Each item: { id, title, handle, url, seo_title, seo_description }
    """

def get_seo_health() -> list[dict]:
    """
    For every product and collection, return:
    {
      type: "product"|"collection"|"page",
      title, url,
      has_seo_title: bool,
      has_seo_description: bool,
      seo_title_length: int,
      seo_description_length: int
    }
    Flag as incomplete if seo_title is None or seo_description is None.
    """
```

---

## Data Source 3: Amazon SP-API

### Authentication — two-step

**Step 1: LWA access token** (expires in 1 hour, fetch fresh each session)
```python
import requests

def get_lwa_token(client_id, client_secret, refresh_token) -> str:
    r = requests.post("https://api.amazon.com/auth/o2/token", data={
        "grant_type":    "refresh_token",
        "refresh_token": refresh_token,   # env["AMAZON_REFRESH_TOKEN"]
        "client_id":     client_id,       # env["AMAZON_CLIENT_ID"]
        "client_secret": client_secret,   # env["AMAZON_CLIENT_SECRET"]
    })
    r.raise_for_status()
    return r.json()["access_token"]
```

**Step 2: AWS Signature V4 signing** (applied to every request)
```python
from requests_aws4auth import AWS4Auth

auth = AWS4Auth(
    env["AWS_ACCESS_KEY_ID"],
    env["AWS_SECRET_ACCESS_KEY"],
    env["AMAZON_REGION"],   # "us-east-1"
    "execute-api"
)
```

**Every SP-API request:**
```python
BASE_URL = "https://sellingpartnerapi-na.amazon.com"

def sp(method, path, params=None, body=None):
    headers = {
        "x-amz-access-token": lwa_token,   # from step 1
        "Content-Type": "application/json"
    }
    r = requests.request(
        method,
        BASE_URL + path,
        auth=auth,          # from step 2
        headers=headers,
        params=params,
        json=body
    )
    return r
```

### Key endpoints

#### Marketplace participations
```
GET /sellers/v1/marketplaceParticipations
```
Response: `{ "payload": [ { "marketplace": { "id", "name" }, "participation": { "isParticipating", "hasSuspendedListings" } } ] }`

#### Catalog items search (find ASINs by keyword)
```
GET /catalog/2022-04-01/items
Params:
  marketplaceIds=ATVPDKIKX0DER
  keywords=your brand name product
  includedData=summaries,attributes,images
  pageSize=10
```
Response shape:
```python
{
  "items": [
    {
      "asin": "B0XXXXXXXXX",
      "summaries": [{
        "itemName": "Your Product Title...",
        "brand": "Your Brand",
        "marketplaceId": "ATVPDKIKX0DER"
      }],
      "attributes": {
        "bullet_point": [
          { "value": "Feature one..." },
          ...
        ],
        "product_description": [{ "value": "Full description..." }],
        "generic_keyword": [{ "value": "keyword1 keyword2" }],
        "item_name": [{ "value": "Full title..." }]
      },
      "images": [{
        "images": [
          { "variant": "MAIN", "link": "https://...", "height": 2560, "width": 2560 }
        ]
      }]
    }
  ]
}
```

#### Reports API — request a report
```
POST /reports/2021-06-30/reports
Body:
{
  "reportType": "GET_MERCHANT_LISTINGS_ALL_DATA",  # or GET_SALES_AND_TRAFFIC_REPORT
  "marketplaceIds": ["ATVPDKIKX0DER"],
  "dataStartTime": "2025-01-01T00:00:00Z",   # required for traffic report
  "dataEndTime":   "2025-01-31T23:59:59Z",
  "reportOptions": { "dateGranularity": "MONTH" }  # for traffic report only
}
```
Response: `{ "reportId": "..." }`

#### Reports API — check status
```
GET /reports/2021-06-30/reports/{reportId}
```
Response: `{ "processingStatus": "IN_QUEUE"|"IN_PROGRESS"|"DONE"|"FATAL", "reportDocumentId": "..." }`

#### Reports API — get document URL
```
GET /reports/2021-06-30/documents/{reportDocumentId}
```
Response: `{ "url": "https://..." }`
Then: `requests.get(url).text` → TSV content for listings, JSON for traffic report.

### Data loader — `dashboard/data/amazon.py`

```python
def get_listing_quality() -> list[dict]:
    """
    For each tracked ASIN, fetch catalog data and compute quality score.
    Returns list of {
      asin, title, title_length,
      bullet_count,    # actual count, max is 5
      has_description: bool,
      has_keywords: bool,
      image_count: int,
      quality_score: int,   # 0-100, computed as:
                            #   title>=150 → +20
                            #   bullets==5 → +20
                            #   has_description → +20
                            #   has_keywords → +20
                            #   images>=6 → +20
      issues: list[str]
    }
    Cache to amazon_cache.json, TTL 6 hours.
    """

def get_marketplace_status() -> list[dict]:
    """
    Returns marketplace participations:
    [{ marketplace_id, name, is_active, has_suspended_listings }]
    """
```

---

## Streamlit App Structure

### Entry point — `dashboard/app.py`

```python
import streamlit as st

st.set_page_config(
    page_title="Store Analytics",
    page_icon="📊",
    layout="wide"
)

tab1, tab2, tab3, tab4, tab5 = st.tabs([
    "📊 Overview",
    "🔍 Google SEO",
    "🛍️ Shopify",
    "📦 Amazon",
    "🔗 Cross-Channel"
])

with tab1: from pages.overview import render; render()
with tab2: from pages.seo import render; render()
with tab3: from pages.shopify import render; render()
with tab4: from pages.amazon import render; render()
with tab5: from pages.cross_channel import render; render()
```

### Caching pattern

Use `@st.cache_data(ttl=3600)` on all data loader functions so Streamlit handles caching automatically. Add a manual "Refresh" button per tab that calls `st.cache_data.clear()`.

```python
@st.cache_data(ttl=3600)
def load_gsc_pages():
    from data.gsc import get_pages
    return get_pages(days=90)
```

### Page specs

#### `pages/overview.py`
- 3 metric columns: GSC Clicks (30d), Shopify Revenue (30d), Amazon ASINs tracked
- `st.metric()` with delta vs prior 30d period
- Alerts section: `st.warning()` for each issue found (missing SEO tags, low bullet count, etc.)
- Refresh button top-right

#### `pages/seo.py`
- Date range selector: 30 / 60 / 90 days (`st.radio`)
- Line chart: clicks + impressions over time (`st.line_chart` with date dimension)
- Two columns:
  - Left: Quick wins table (pos 5–20) — `st.dataframe()` with color highlighting on position column
  - Right: Low CTR pages — bar chart of CTR by page
- Branded vs non-branded: `st.plotly_chart` donut chart
- Top queries: sortable `st.dataframe()`

#### `pages/shopify.py`
- Products table with SEO health columns (green ✅ / red ❌ for seo_title, seo_description)
- Revenue by product: horizontal bar chart
- Collections SEO health table

#### `pages/amazon.py`
- Listing quality scorecard: `st.dataframe()` with color-coded quality_score column
  - Red: score < 60, Yellow: 60–80, Green: > 80
- Per-ASIN expandable detail: `st.expander(asin)` showing all fields and issues list
- Missing keywords callout: `st.error()` for each ASIN with has_keywords=False

#### `pages/cross_channel.py`
- Join GSC pages data with Shopify products on URL path (`/products/{handle}`)
- Join Shopify products with Amazon ASINs on product title similarity (fuzzy match)
- Table: product title | GSC impressions | GSC position | Shopify revenue | Amazon ASIN | Amazon quality score
- Highlight rows where GSC impressions > 200 but Shopify revenue = $0 (traffic not converting)
- Highlight rows where Shopify revenue > $0 but no Amazon listing (expansion opportunity)

---

## Dependencies

```
streamlit>=1.35.0
requests>=2.31.0
requests-aws4auth>=1.3.0
google-auth>=2.28.0
google-auth-oauthlib>=1.2.0
google-auth-httplib2>=0.2.0
google-api-python-client>=2.120.0
plotly>=5.20.0
pandas>=2.2.0
```

Install: `pip install streamlit plotly pandas requests-aws4auth google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client`

Run: `cd dashboard && streamlit run app.py`

---

## Notes

- All credential access goes through the `.env` loader pattern — never hardcode values
- The Shopify token file at `~/.config/shopify/token.json` is separate from `.env`
- The GSC token at `~/.config/gsc/token.json` auto-refreshes — do not re-implement the OAuth flow
- Amazon LWA tokens expire in 1 hour — fetch a fresh one at the start of each Streamlit session, store in `st.session_state["amazon_token"]`
- SP-API rate limits: Catalog Items = 2 req/sec, Reports = 0.0167 req/sec (1/min). Add `time.sleep()` between catalog calls
- GSC data has a 3-day lag — always set `endDate` to `today - 3 days`
- Shopify pagination: use `limit=250` and follow `Link` header for next page cursor if product count > 250
- Amazon report processing takes 1–5 minutes. Request the report, store the `reportId` in `st.session_state`, poll with a spinner
