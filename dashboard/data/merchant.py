import json
import os
from pathlib import Path

import requests
from google.auth.transport.requests import AuthorizedSession
from google.oauth2 import service_account

_DIR = Path(__file__).parent.parent
ENV_FILE = _DIR.parent / ".env"

SCOPE = "https://www.googleapis.com/auth/content"
BASE_URL = "https://merchantapi.googleapis.com"


def _load_env() -> dict:
    env = {}
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    key, value = line.split("=", 1)
                    env[key.strip()] = value.strip().strip('"').strip("'")
    return env


def _credential_path(env: dict) -> str:
    path = (
        os.environ.get("GOOGLE_APPLICATION_CREDENTIALS")
        or os.environ.get("GOOGLE_MERCHANT_CREDENTIALS")
        or env.get("GOOGLE_APPLICATION_CREDENTIALS")
        or env.get("GOOGLE_MERCHANT_CREDENTIALS")
        or env.get("GSC_CREDENTIALS")
    )
    if not path:
        raise RuntimeError(
            "Set GOOGLE_APPLICATION_CREDENTIALS, GOOGLE_MERCHANT_CREDENTIALS, "
            "or GSC_CREDENTIALS in .env to your service account JSON path."
        )
    return os.path.expanduser(path)


def _session() -> AuthorizedSession:
    env = _load_env()
    info_json = os.environ.get("GOOGLE_MERCHANT_CREDENTIALS_JSON") or env.get(
        "GOOGLE_MERCHANT_CREDENTIALS_JSON"
    )
    if info_json:
        creds = service_account.Credentials.from_service_account_info(
            json.loads(info_json),
            scopes=[SCOPE],
        )
    else:
        creds = service_account.Credentials.from_service_account_file(
            _credential_path(env),
            scopes=[SCOPE],
        )
    return AuthorizedSession(creds)


def _get(path: str, params=None) -> dict:
    response = _session().get(f"{BASE_URL}{path}", params=params)
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        detail = response.text[:1000]
        raise RuntimeError(f"Merchant API request failed: {response.status_code} {detail}") from exc
    return response.json()


def list_accounts(page_size=50) -> list:
    data = _get("/accounts/v1/accounts", params={"pageSize": page_size})
    return data.get("accounts", [])


def get_configured_account_id() -> str:
    env = _load_env()
    return os.environ.get("GOOGLE_MERCHANT_ID") or env.get("GOOGLE_MERCHANT_ID", "")


def list_products(account_id=None, page_size=250, max_pages=10) -> list:
    account_id = account_id or get_configured_account_id()
    if not account_id:
        raise RuntimeError("Set GOOGLE_MERCHANT_ID in .env before listing products.")

    products = []
    page_token = None
    for _ in range(max_pages):
        params = {"pageSize": page_size}
        if page_token:
            params["pageToken"] = page_token
        data = _get(f"/products/v1/accounts/{account_id}/products", params=params)
        products.extend(data.get("products", []))
        page_token = data.get("nextPageToken")
        if not page_token:
            break
    return products


def _money_text(price: dict) -> str:
    amount = price.get("amountMicros")
    if not amount:
        return ""
    return f"{int(amount) / 1_000_000:.2f} {price.get('currencyCode', '')}".strip()


def _custom_attr(product: dict, name: str) -> str:
    for attr in product.get("customAttributes", []):
        if attr.get("name") == name:
            return attr.get("value", "")
    return ""


def get_feed_health(account_id=None) -> list:
    rows = []
    for product in list_products(account_id=account_id):
        attrs = product.get("productAttributes", {})
        status = product.get("productStatus", {})
        destinations = status.get("destinationStatuses", [])
        approved = [
            d.get("reportingContext", "")
            for d in destinations
            if d.get("approvedCountries")
        ]
        disapproved = [
            d.get("reportingContext", "")
            for d in destinations
            if d.get("disapprovedCountries")
        ]
        pending = [
            d.get("reportingContext", "")
            for d in destinations
            if d.get("pendingCountries")
        ]
        issues = status.get("itemLevelIssues", [])

        title = attrs.get("title", "")
        description = attrs.get("description", "")
        image_count = int(bool(attrs.get("imageLink"))) + len(attrs.get("additionalImageLinks", []))
        price = attrs.get("price", {})
        missing = []
        if not title:
            missing.append("title")
        if not description:
            missing.append("description")
        if not attrs.get("imageLink"):
            missing.append("image")
        if not price.get("amountMicros"):
            missing.append("price")
        if not attrs.get("availability"):
            missing.append("availability")
        if not attrs.get("brand"):
            missing.append("brand")

        rows.append(
            {
                "name": product.get("name", ""),
                "offer_id": product.get("offerId", ""),
                "sku": _custom_attr(product, "sku"),
                "shopify_variant_gid": _custom_attr(product, "merchant item id"),
                "title": title,
                "description_length": len(description),
                "link": attrs.get("link", ""),
                "availability": attrs.get("availability", ""),
                "price": _money_text(price),
                "brand": attrs.get("brand", ""),
                "google_product_category": attrs.get("googleProductCategory", ""),
                "product_types": ", ".join(attrs.get("productTypes", [])),
                "image_count": image_count,
                "approved_destinations": approved,
                "disapproved_destinations": disapproved,
                "pending_destinations": pending,
                "free_listings": "FREE_LISTINGS" in approved,
                "shopping_ads": "SHOPPING_ADS" in approved,
                "issue_count": len(issues),
                "issues": issues,
                "missing_fields": missing,
                "last_update": status.get("lastUpdateDate", ""),
                "expiration": status.get("googleExpirationDate", ""),
            }
        )
    return rows


def register_developer(account_id: str, developer_email: str) -> dict:
    response = _session().post(
        f"{BASE_URL}/accounts/v1/accounts/{account_id}/developerRegistration:registerGcp",
        json={"developerEmail": developer_email},
    )
    try:
        response.raise_for_status()
    except requests.HTTPError as exc:
        detail = response.text[:1000]
        raise RuntimeError(
            f"Merchant API developer registration failed: {response.status_code} {detail}"
        ) from exc
    return response.json()
