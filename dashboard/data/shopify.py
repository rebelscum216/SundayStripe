import json, time, requests
from datetime import datetime, timedelta, timezone
from pathlib import Path

_DIR = Path(__file__).parent.parent
_CACHE_FILE = _DIR / "cache" / "shopify_cache.json"
_CACHE_TTL = 3600  # 1 hour
ENV_FILE = _DIR.parent / ".env"

_env = {}
if ENV_FILE.exists():
    with open(ENV_FILE) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                _env[k.strip()] = v.strip().strip('"').strip("'")

try:
    with open(Path.home() / ".config" / "shopify" / "token.json") as f:
        _creds = json.load(f)
except FileNotFoundError:
    _creds = {}

SHOP = _env.get("SHOPIFY_SHOP") or _creds["shop"]
TOKEN = (
    _env.get("SHOPIFY_ADMIN_ACCESS_TOKEN")
    or _env.get("SHOPIFY_ACCESS_TOKEN")
    or _creds["access_token"]
)
VERSION = "2026-04"
BASE = f"https://{SHOP}/admin/api/{VERSION}"
HEADERS = {"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"}


def _get(path, params=None):
    r = requests.get(f"{BASE}{path}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()


def get_access_scopes() -> list:
    r = requests.get(
        f"https://{SHOP}/admin/oauth/access_scopes.json",
        headers=HEADERS,
    )
    r.raise_for_status()
    data = r.json()
    return [scope.get("handle", "") for scope in data.get("access_scopes", [])]


def has_scope(scope: str) -> bool:
    return scope in get_access_scopes()


def _get_all(path, key, params=None):
    params = dict(params or {})
    params.setdefault("limit", 250)
    results = []
    url = f"{BASE}{path}"
    while url:
        r = requests.get(url, headers=HEADERS, params=params)
        r.raise_for_status()
        results.extend(r.json().get(key, []))
        link = r.headers.get("Link", "")
        url = None
        params = None
        for part in link.split(","):
            if 'rel="next"' in part:
                url = part.split(";")[0].strip().strip("<>")
    return results


def _load_cache():
    if _CACHE_FILE.exists():
        try:
            return json.loads(_CACHE_FILE.read_text())
        except Exception:
            return {}
    return {}


def _save_cache(data: dict):
    _CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    data["_ts"] = time.time()
    _CACHE_FILE.write_text(json.dumps(data))


def _cache_valid(cache: dict, ttl=_CACHE_TTL) -> bool:
    return bool(cache.get("_ts")) and time.time() - cache["_ts"] < ttl


def _get_metafields(resource, resource_id):
    data = _get(f"/{resource}/{resource_id}/metafields.json", params={"namespace": "global"})
    mf = {m["key"]: m["value"] for m in data.get("metafields", [])}
    return mf.get("title_tag"), mf.get("description_tag")


def get_products(force_refresh=False) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "products" in cache:
        return cache["products"]

    raw = _get_all("/products.json", "products", {"status": "active"})
    products = []
    for p in raw:
        seo_title, seo_desc = _get_metafields("products", p["id"])
        variants = p.get("variants", [])
        prices = [float(v["price"]) for v in variants if v.get("price")]
        inventory = sum(v.get("inventory_quantity", 0) or 0 for v in variants)
        products.append(
            {
                "id": p["id"],
                "title": p["title"],
                "handle": p["handle"],
                "status": p["status"],
                "url": f"/products/{p['handle']}",
                "variant_count": len(variants),
                "total_inventory": inventory,
                "price_min": min(prices) if prices else 0,
                "price_max": max(prices) if prices else 0,
                "seo_title": seo_title,
                "seo_description": seo_desc,
                "image_count": len(p.get("images", [])),
            }
        )

    cache["products"] = products
    _save_cache(cache)
    return products


def get_revenue_by_product(days=30, force_refresh=False) -> list:
    cache = _load_cache()
    key = f"revenue_{days}"
    if not force_refresh and _cache_valid(cache) and key in cache:
        return cache[key]

    now = datetime.now(timezone.utc)
    start = (now - timedelta(days=days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    end = now.strftime("%Y-%m-%dT%H:%M:%SZ")

    orders = _get_all(
        "/orders.json",
        "orders",
        {
            "status": "any",
            "created_at_min": start,
            "created_at_max": end,
            "fields": "id,created_at,total_price,line_items",
        },
    )

    agg = {}
    for order in orders:
        for item in order.get("line_items", []):
            pid = item.get("product_id")
            if not pid:
                continue
            if pid not in agg:
                agg[pid] = {"product_id": pid, "title": item.get("title", ""), "units_sold": 0, "revenue": 0.0}
            agg[pid]["units_sold"] += item.get("quantity", 0)
            agg[pid]["revenue"] += float(item.get("price", 0)) * item.get("quantity", 0)

    result = sorted(agg.values(), key=lambda x: x["revenue"], reverse=True)
    for r in result:
        r["revenue"] = round(r["revenue"], 2)

    cache[key] = result
    _save_cache(cache)
    return result


def get_collections(force_refresh=False) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "collections" in cache:
        return cache["collections"]

    collections = []
    for kind, key in [("custom_collections", "custom_collections"), ("smart_collections", "smart_collections")]:
        raw = _get_all(f"/{kind}.json", key)
        for c in raw:
            seo_title, seo_desc = _get_metafields(kind, c["id"])
            collections.append(
                {
                    "id": c["id"],
                    "title": c["title"],
                    "handle": c["handle"],
                    "url": f"/collections/{c['handle']}",
                    "type": kind.replace("_collections", ""),
                    "seo_title": seo_title,
                    "seo_description": seo_desc,
                }
            )

    cache["collections"] = collections
    _save_cache(cache)
    return collections


def get_pages_list(force_refresh=False) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "pages" in cache:
        return cache["pages"]

    raw = _get_all("/pages.json", "pages")
    pages = []
    for pg in raw:
        seo_title, seo_desc = _get_metafields("pages", pg["id"])
        pages.append(
            {
                "id": pg["id"],
                "title": pg["title"],
                "handle": pg["handle"],
                "url": f"/pages/{pg['handle']}",
                "seo_title": seo_title,
                "seo_description": seo_desc,
            }
        )

    cache["pages"] = pages
    _save_cache(cache)
    return pages


def get_seo_health(force_refresh=False) -> list:
    results = []

    for p in get_products(force_refresh):
        results.append(
            {
                "type": "product",
                "title": p["title"],
                "url": p["url"],
                "has_seo_title": p["seo_title"] is not None,
                "has_seo_description": p["seo_description"] is not None,
                "seo_title_length": len(p["seo_title"]) if p["seo_title"] else 0,
                "seo_description_length": len(p["seo_description"]) if p["seo_description"] else 0,
            }
        )

    for c in get_collections(force_refresh):
        results.append(
            {
                "type": "collection",
                "title": c["title"],
                "url": c["url"],
                "has_seo_title": c["seo_title"] is not None,
                "has_seo_description": c["seo_description"] is not None,
                "seo_title_length": len(c["seo_title"]) if c["seo_title"] else 0,
                "seo_description_length": len(c["seo_description"]) if c["seo_description"] else 0,
            }
        )

    for pg in get_pages_list(force_refresh):
        results.append(
            {
                "type": "page",
                "title": pg["title"],
                "url": pg["url"],
                "has_seo_title": pg["seo_title"] is not None,
                "has_seo_description": pg["seo_description"] is not None,
                "seo_title_length": len(pg["seo_title"]) if pg["seo_title"] else 0,
                "seo_description_length": len(pg["seo_description"]) if pg["seo_description"] else 0,
            }
        )

    return results
