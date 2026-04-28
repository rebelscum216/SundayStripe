import os, json, time
from datetime import datetime, timedelta
from pathlib import Path

from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

_DIR = Path(__file__).parent.parent
_CACHE_FILE = _DIR / "cache" / "gsc_cache.json"
_CACHE_TTL = 86400  # 24 hours

ENV_FILE = _DIR.parent / ".env"
_env = {}
with open(ENV_FILE) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            _env[k.strip()] = v.strip()

TOKEN_FILE = os.path.expanduser("~/.config/gsc/token.json")
SITE = _env.get("GSC_SITE", "sc-domain:example.com")
SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]


def _get_service():
    token_json = os.environ.get("GSC_TOKEN_JSON") or _env.get("GSC_TOKEN_JSON")
    if token_json:
        creds = Credentials.from_authorized_user_info(json.loads(token_json), SCOPES)
    else:
        token_file = os.environ.get("GSC_TOKEN") or _env.get("GSC_TOKEN") or TOKEN_FILE
        creds = Credentials.from_authorized_user_file(os.path.expanduser(token_file), SCOPES)
    if creds.expired and creds.refresh_token:
        creds.refresh(Request())
    return build("searchconsole", "v1", credentials=creds)


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


def _date_range(days: int):
    end = datetime.utcnow().date() - timedelta(days=3)
    start = end - timedelta(days=days)
    return str(start), str(end)


def _query(service, dimensions, days, row_limit=500):
    start, end = _date_range(days)
    return (
        service.searchanalytics()
        .query(
            siteUrl=SITE,
            body={
                "startDate": start,
                "endDate": end,
                "dimensions": dimensions,
                "rowLimit": row_limit,
                "dataState": "final",
            },
        )
        .execute()
    )


def _fetch_all(force_refresh=False) -> dict:
    cache = _load_cache()
    if not force_refresh and _cache_valid(cache):
        return cache

    svc = _get_service()
    data = {}

    for days in [30, 60, 90]:
        by_page = _query(svc, ["page"], days)
        by_query = _query(svc, ["query"], days)
        by_date = _query(svc, ["date"], days)
        by_page_query = _query(svc, ["page", "query"], days)
        data[str(days)] = {
            "by_page": by_page.get("rows", []),
            "by_query": by_query.get("rows", []),
            "by_date": by_date.get("rows", []),
            "by_page_query": by_page_query.get("rows", []),
        }

    _save_cache(data)
    return data


def _bucket(data: dict, days: int) -> dict:
    return data.get(str(days), data.get(days, {}))


def _rows_to_pages(rows):
    results = []
    for row in rows:
        url = row["keys"][0].replace("https://example.com", "")
        results.append(
            {
                "url": url,
                "clicks": row.get("clicks", 0),
                "impressions": row.get("impressions", 0),
                "ctr": round(row.get("ctr", 0) * 100, 2),
                "position": round(row.get("position", 0), 1),
            }
        )
    return results


def get_site_summary(days=90, force_refresh=False) -> dict:
    data = _fetch_all(force_refresh)
    rows = _bucket(data, days).get("by_date", [])
    clicks = sum(r.get("clicks", 0) for r in rows)
    impressions = sum(r.get("impressions", 0) for r in rows)
    ctrs = [r.get("ctr", 0) for r in rows if r.get("impressions", 0) > 0]
    positions = [r.get("position", 0) for r in rows if r.get("impressions", 0) > 0]
    return {
        "clicks": clicks,
        "impressions": impressions,
        "avg_ctr": round(sum(ctrs) / len(ctrs) * 100, 2) if ctrs else 0,
        "avg_position": round(sum(positions) / len(positions), 1) if positions else 0,
    }


def get_pages(days=90, force_refresh=False) -> list:
    data = _fetch_all(force_refresh)
    rows = _bucket(data, days).get("by_page", [])
    return _rows_to_pages(rows)


def get_queries(days=90, force_refresh=False) -> list:
    data = _fetch_all(force_refresh)
    rows = _bucket(data, days).get("by_query", [])
    results = []
    for row in rows:
        results.append(
            {
                "query": row["keys"][0],
                "clicks": row.get("clicks", 0),
                "impressions": row.get("impressions", 0),
                "ctr": round(row.get("ctr", 0) * 100, 2),
                "position": round(row.get("position", 0), 1),
            }
        )
    return results


def get_quick_wins(days=90, force_refresh=False) -> list:
    pages = get_pages(days, force_refresh)
    wins = [p for p in pages if 5 <= p["position"] <= 20 and p["impressions"] >= 100]
    return sorted(wins, key=lambda x: x["impressions"], reverse=True)


def get_low_ctr_pages(days=90, force_refresh=False) -> list:
    pages = get_pages(days, force_refresh)
    low = [p for p in pages if p["impressions"] >= 500 and p["ctr"] < 3.0]
    return sorted(low, key=lambda x: x["impressions"], reverse=True)


def get_branded_split(days=90, force_refresh=False) -> dict:
    queries = get_queries(days, force_refresh)
    branded = {"clicks": 0, "impressions": 0}
    nonbranded = {"clicks": 0, "impressions": 0}
    for q in queries:
        term = q["query"].lower()
        target = branded if "example brand" in term or "examplebrand" in term else nonbranded
        target["clicks"] += q["clicks"]
        target["impressions"] += q["impressions"]
    return {"branded": branded, "nonbranded": nonbranded}


def get_page_query_map(days=90, force_refresh=False) -> list:
    data = _fetch_all(force_refresh)
    rows = _bucket(data, days).get("by_page_query", [])
    results = []
    for row in rows:
        url = row["keys"][0].replace("https://example.com", "")
        results.append(
            {
                "url": url,
                "query": row["keys"][1],
                "clicks": row.get("clicks", 0),
                "impressions": row.get("impressions", 0),
                "ctr": round(row.get("ctr", 0) * 100, 2),
                "position": round(row.get("position", 0), 1),
            }
        )
    return results


def get_clicks_by_date(days=90, force_refresh=False) -> list:
    data = _fetch_all(force_refresh)
    rows = _bucket(data, days).get("by_date", [])
    return [
        {
            "date": row["keys"][0],
            "clicks": row.get("clicks", 0),
            "impressions": row.get("impressions", 0),
        }
        for row in rows
    ]
