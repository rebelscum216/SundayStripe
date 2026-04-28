import time, json
from pathlib import Path
import requests
from requests_aws4auth import AWS4Auth

_DIR = Path(__file__).parent.parent
_CACHE_FILE = _DIR / "cache" / "amazon_cache.json"
_CACHE_TTL = 21600  # 6 hours

ENV_FILE = _DIR.parent / ".env"
_env = {}
with open(ENV_FILE) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            _env[k.strip()] = v.strip()

CLIENT_ID = _env.get("AMAZON_CLIENT_ID_PROD") or _env["AMAZON_CLIENT_ID"]
CLIENT_SECRET = _env.get("AMAZON_SECRET_PROD") or _env["AMAZON_CLIENT_SECRET"]
REFRESH_TOKEN = _env.get("AMAZON_REFRESH_TOKEN_PROD") or _env["AMAZON_REFRESH_TOKEN"]
MARKETPLACE_ID = _env["AMAZON_MARKETPLACE_ID"]
REGION = _env["AMAZON_REGION"]
AWS_KEY = _env["AWS_ACCESS_KEY_ID"]
AWS_SECRET = _env["AWS_SECRET_ACCESS_KEY"]
BASE_URL = "https://sellingpartnerapi-na.amazon.com"

KNOWN_ASINS = [
    "B0FMKMHK25",
    "B0FGJZ9Y22",
    "B0FGK1PS7M",
    "B0FGK1GV96",
    "B0C59JTN7C",
    "B0CN8RK8V8",
    "B0C59SC5RZ",
]


def get_lwa_token() -> str:
    r = requests.post(
        "https://api.amazon.com/auth/o2/token",
        data={
            "grant_type": "refresh_token",
            "refresh_token": REFRESH_TOKEN,
            "client_id": CLIENT_ID,
            "client_secret": CLIENT_SECRET,
        },
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _sp(method, path, token, params=None, body=None):
    auth = AWS4Auth(AWS_KEY, AWS_SECRET, REGION, "execute-api")
    headers = {"x-amz-access-token": token, "Content-Type": "application/json"}
    return requests.request(
        method, BASE_URL + path, auth=auth, headers=headers, params=params, json=body
    )


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


def _cache_valid(cache: dict) -> bool:
    return bool(cache.get("_ts")) and time.time() - cache["_ts"] < _CACHE_TTL


def get_listing_quality(token: str, force_refresh=False) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "listing_quality" in cache:
        return cache["listing_quality"]

    results = []
    for asin in KNOWN_ASINS:
        r = _sp(
            "GET",
            f"/catalog/2022-04-01/items/{asin}",
            token,
            params={
                "marketplaceIds": MARKETPLACE_ID,
                "includedData": "summaries,attributes,images",
            },
        )
        time.sleep(0.6)

        if r.status_code != 200:
            results.append(
                {
                    "asin": asin,
                    "title": "Error fetching",
                    "title_length": 0,
                    "bullet_count": 0,
                    "has_description": False,
                    "has_keywords": False,
                    "image_count": 0,
                    "quality_score": 0,
                    "issues": [f"API error {r.status_code}"],
                }
            )
            continue

        item = r.json()
        summ = item.get("summaries", [{}])[0]
        attrs = item.get("attributes", {})
        imgs = item.get("images", [{}])

        title = summ.get("itemName", "")
        bullets = attrs.get("bullet_point", [])
        desc_list = attrs.get("product_description", [])
        has_desc = bool(desc_list and desc_list[0].get("value"))
        kw_list = attrs.get("generic_keyword", [])
        has_kw = bool(kw_list and kw_list[0].get("value"))
        num_imgs = sum(len(i.get("images", [])) for i in imgs)

        score = 0
        issues = []
        if len(title) >= 150:
            score += 20
        else:
            issues.append(f"Title short ({len(title)} chars — aim for 150+)")
        if len(bullets) >= 5:
            score += 20
        else:
            issues.append(f"Only {len(bullets)}/5 bullet points")
        if has_desc:
            score += 20
        else:
            issues.append("No product description")
        if has_kw:
            score += 20
        else:
            issues.append("No backend search keywords")
        if num_imgs >= 6:
            score += 20
        else:
            issues.append(f"Only {num_imgs} images (aim for 6+)")

        results.append(
            {
                "asin": asin,
                "title": title[:80] + "..." if len(title) > 80 else title,
                "title_length": len(title),
                "bullet_count": len(bullets),
                "has_description": has_desc,
                "has_keywords": has_kw,
                "image_count": num_imgs,
                "quality_score": score,
                "issues": issues,
            }
        )

    cache["listing_quality"] = results
    _save_cache(cache)
    return results


def get_marketplace_status(token: str) -> list:
    r = _sp("GET", "/sellers/v1/marketplaceParticipations", token)
    if r.status_code != 200:
        return []
    results = []
    for p in r.json().get("payload", []):
        mkt = p.get("marketplace", {})
        part = p.get("participation", {})
        results.append(
            {
                "marketplace_id": mkt.get("id"),
                "name": mkt.get("name"),
                "is_active": part.get("isParticipating", False),
                "has_suspended_listings": part.get("hasSuspendedListings", False),
            }
        )
    return results


def get_fba_inventory(token: str, force_refresh=False) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "fba_inventory" in cache:
        return cache["fba_inventory"]

    summaries = []
    params = {
        "details": "true",
        "granularityType": "Marketplace",
        "granularityId": MARKETPLACE_ID,
        "marketplaceIds": MARKETPLACE_ID,
    }

    while True:
        r = _sp("GET", "/fba/inventory/v1/summaries", token, params=params)
        if r.status_code != 200:
            raise RuntimeError(f"FBA inventory API error {r.status_code}: {r.text[:1000]}")

        payload = r.json().get("payload", {})
        summaries.extend(payload.get("inventorySummaries", []))
        next_token = payload.get("pagination", {}).get("nextToken")
        if not next_token:
            break
        params = {"nextToken": next_token}
        time.sleep(0.6)

    results = []
    for item in summaries:
        details = item.get("inventoryDetails", {})
        reserved = details.get("reservedQuantity", {})
        researching = details.get("researchingQuantity", {})
        unfulfillable = details.get("unfulfillableQuantity", {})
        future = details.get("futureSupplyQuantity", {})

        fulfillable = details.get("fulfillableQuantity", 0) or 0
        inbound_working = details.get("inboundWorkingQuantity", 0) or 0
        inbound_shipped = details.get("inboundShippedQuantity", 0) or 0
        inbound_receiving = details.get("inboundReceivingQuantity", 0) or 0
        inbound_total = inbound_working + inbound_shipped + inbound_receiving
        reserved_total = reserved.get("totalReservedQuantity", 0) or 0
        unfulfillable_total = unfulfillable.get("totalUnfulfillableQuantity", 0) or 0
        researching_total = researching.get("totalResearchingQuantity", 0) or 0

        alerts = []
        if fulfillable <= 0:
            alerts.append("Out of stock")
        elif fulfillable <= 5:
            alerts.append("Low stock")
        if inbound_total:
            alerts.append("Inbound")
        if reserved_total > fulfillable and reserved_total > 0:
            alerts.append("High reserved")
        if unfulfillable_total:
            alerts.append("Unfulfillable")
        if researching_total:
            alerts.append("Researching")

        results.append(
            {
                "asin": item.get("asin", ""),
                "fnsku": item.get("fnSku", ""),
                "seller_sku": item.get("sellerSku", ""),
                "condition": item.get("condition", ""),
                "product_name": item.get("productName", ""),
                "total_quantity": item.get("totalQuantity", 0) or 0,
                "fulfillable": fulfillable,
                "inbound_working": inbound_working,
                "inbound_shipped": inbound_shipped,
                "inbound_receiving": inbound_receiving,
                "inbound_total": inbound_total,
                "reserved_total": reserved_total,
                "pending_customer_order": reserved.get("pendingCustomerOrderQuantity", 0) or 0,
                "pending_transshipment": reserved.get("pendingTransshipmentQuantity", 0) or 0,
                "fc_processing": reserved.get("fcProcessingQuantity", 0) or 0,
                "unfulfillable_total": unfulfillable_total,
                "customer_damaged": unfulfillable.get("customerDamagedQuantity", 0) or 0,
                "warehouse_damaged": unfulfillable.get("warehouseDamagedQuantity", 0) or 0,
                "defective": unfulfillable.get("defectiveQuantity", 0) or 0,
                "researching_total": researching_total,
                "future_supply_reserved": future.get("reservedFutureSupplyQuantity", 0) or 0,
                "future_supply_buyable": future.get("futureSupplyBuyableQuantity", 0) or 0,
                "last_updated": item.get("lastUpdatedTime", ""),
                "alerts": alerts,
            }
        )

    results.sort(key=lambda x: (x["fulfillable"], x["product_name"], x["seller_sku"]))
    cache["fba_inventory"] = results
    _save_cache(cache)
    return results


def _get_inbound_plan_page(token: str, params: dict) -> dict:
    r = _sp("GET", "/inbound/fba/2024-03-20/inboundPlans", token, params=params)
    if r.status_code != 200:
        raise RuntimeError(f"Inbound plans API error {r.status_code}: {r.text[:1000]}")
    return r.json()


def _get_inbound_plan(token: str, inbound_plan_id: str) -> dict:
    r = _sp("GET", f"/inbound/fba/2024-03-20/inboundPlans/{inbound_plan_id}", token)
    if r.status_code != 200:
        raise RuntimeError(f"Inbound plan detail API error {r.status_code}: {r.text[:1000]}")
    return r.json()


def _get_inbound_plan_items(token: str, inbound_plan_id: str) -> list:
    items = []
    params = {"pageSize": 100}
    while True:
        r = _sp(
            "GET",
            f"/inbound/fba/2024-03-20/inboundPlans/{inbound_plan_id}/items",
            token,
            params=params,
        )
        if r.status_code != 200:
            raise RuntimeError(f"Inbound plan items API error {r.status_code}: {r.text[:1000]}")

        data = r.json()
        items.extend(data.get("items", []))
        next_token = data.get("pagination", {}).get("nextToken")
        if not next_token:
            break
        params["paginationToken"] = next_token
        time.sleep(0.6)
    return items


def get_inbound_shipments(token: str, force_refresh=False, page_size=20) -> list:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache) and "inbound_shipments" in cache:
        return cache["inbound_shipments"]

    plans = []
    for status in ["ACTIVE", "SHIPPED"]:
        params = {"pageSize": page_size, "status": status}
        while True:
            data = _get_inbound_plan_page(token, params)
            plans.extend(data.get("inboundPlans", []))
            next_token = data.get("pagination", {}).get("nextToken")
            if not next_token:
                break
            params["paginationToken"] = next_token
            time.sleep(0.6)

    results = []
    seen = set()
    for plan in plans:
        inbound_plan_id = plan.get("inboundPlanId", "")
        if not inbound_plan_id or inbound_plan_id in seen:
            continue
        seen.add(inbound_plan_id)

        detail = {}
        items = []
        detail_error = ""
        try:
            detail = _get_inbound_plan(token, inbound_plan_id)
            time.sleep(0.4)
            items = _get_inbound_plan_items(token, inbound_plan_id)
            time.sleep(0.4)
        except RuntimeError as exc:
            detail_error = str(exc)

        shipment_rows = detail.get("shipments", [])
        status = detail.get("status") or plan.get("status", "")
        item_quantity = sum(item.get("quantity", 0) or 0 for item in items)
        shipment_statuses = sorted({s.get("status", "") for s in shipment_rows if s.get("status")})

        alerts = []
        if detail_error:
            alerts.append("Detail unavailable")
        if status == "ACTIVE" and not shipment_rows:
            alerts.append("Plan not shipped")
        if any(s in shipment_statuses for s in ["WORKING", "READY_TO_SHIP"]):
            alerts.append("Needs ship action")
        if any(s in shipment_statuses for s in ["DELIVERED", "CHECKED_IN", "RECEIVING"]):
            alerts.append("Receiving")

        results.append(
            {
                "inbound_plan_id": inbound_plan_id,
                "name": detail.get("name") or plan.get("name") or "",
                "status": status,
                "created_at": detail.get("createdAt") or plan.get("createdAt") or "",
                "last_updated_at": detail.get("lastUpdatedAt") or plan.get("lastUpdatedAt") or "",
                "marketplace_ids": ", ".join(detail.get("marketplaceIds", [])),
                "shipment_count": len(shipment_rows),
                "shipment_ids": [s.get("shipmentId", "") for s in shipment_rows],
                "shipment_statuses": shipment_statuses,
                "item_count": len(items),
                "item_quantity": item_quantity,
                "items": [
                    {
                        "msku": item.get("msku", ""),
                        "asin": item.get("asin", ""),
                        "fnsku": item.get("fnsku", ""),
                        "quantity": item.get("quantity", 0) or 0,
                        "label_owner": item.get("labelOwner", ""),
                    }
                    for item in items
                ],
                "alerts": alerts,
                "detail_error": detail_error,
            }
        )

    results.sort(key=lambda x: x["last_updated_at"], reverse=True)
    cache["inbound_shipments"] = results
    _save_cache(cache)
    return results
