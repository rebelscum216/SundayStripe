#!/usr/bin/env python3
"""
GSC SEO opportunity analysis script.
Finds: high-impression/low-CTR pages, positions 5-20 quick wins, top queries by page
"""

import os
import json
from datetime import date, timedelta
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build

SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly"]
SECRETS_FILE = os.path.expanduser(os.environ.get("GSC_CREDENTIALS", "~/Downloads/client_secret.json"))
TOKEN_FILE = os.path.expanduser("~/.config/gsc/token.json")
SITE = os.environ.get("GSC_SITE", "sc-domain:your-domain.com")
DAYS = 90


def get_credentials():
    creds = None
    os.makedirs(os.path.dirname(TOKEN_FILE), exist_ok=True)
    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(SECRETS_FILE, SCOPES)
            creds = flow.run_local_server(port=0)
        with open(TOKEN_FILE, "w") as f:
            f.write(creds.to_json())
    return creds


def query_gsc(service, dimensions, row_limit=500, start_date=None, end_date=None):
    end = end_date or date.today() - timedelta(days=3)
    start = start_date or end - timedelta(days=DAYS)
    body = {
        "startDate": str(start),
        "endDate": str(end),
        "dimensions": dimensions,
        "rowLimit": row_limit,
        "dataState": "final",
    }
    return service.searchanalytics().query(siteUrl=SITE, body=body).execute()


def fmt(n, decimals=1):
    return f"{n:.{decimals}f}"


def print_section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


def main():
    print("Authenticating with Google Search Console...")
    creds = get_credentials()
    service = build("searchconsole", "v1", credentials=creds)
    print("Connected.\n")

    # --- Overall site summary ---
    print_section("SITE SUMMARY (last 90 days)")
    r = query_gsc(service, ["date"])
    rows = r.get("rows", [])
    total_clicks = sum(row["clicks"] for row in rows)
    total_impressions = sum(row["impressions"] for row in rows)
    avg_ctr = (total_clicks / total_impressions * 100) if total_impressions else 0
    avg_pos = sum(row["position"] for row in rows) / len(rows) if rows else 0
    print(f"  Clicks:       {int(total_clicks):,}")
    print(f"  Impressions:  {int(total_impressions):,}")
    print(f"  Avg CTR:      {fmt(avg_ctr)}%")
    print(f"  Avg Position: {fmt(avg_pos)}")

    # --- Top pages by clicks ---
    print_section("TOP 20 PAGES BY CLICKS")
    r = query_gsc(service, ["page"])
    rows = sorted(r.get("rows", []), key=lambda x: x["clicks"], reverse=True)[:20]
    print(f"  {'Page':<55} {'Clicks':>7} {'Impr':>8} {'CTR':>6} {'Pos':>6}")
    print(f"  {'-'*55} {'-'*7} {'-'*8} {'-'*6} {'-'*6}")
    for row in rows:
        page = row["keys"][0].replace(f"https://{SITE.replace('sc-domain:', '')}", "")[:54]
        print(f"  {page:<55} {int(row['clicks']):>7,} {int(row['impressions']):>8,} {row['ctr']*100:>5.1f}% {row['position']:>6.1f}")

    # --- Quick win opportunities: positions 5-20, high impressions ---
    print_section("QUICK WIN OPPORTUNITIES (position 5-20, 100+ impressions)")
    r = query_gsc(service, ["page"])
    rows = r.get("rows", [])
    quick_wins = [
        row for row in rows
        if 5 <= row["position"] <= 20 and row["impressions"] >= 100
    ]
    quick_wins.sort(key=lambda x: x["impressions"], reverse=True)
    print(f"  {'Page':<55} {'Impr':>8} {'Clicks':>7} {'CTR':>6} {'Pos':>6}")
    print(f"  {'-'*55} {'-'*8} {'-'*7} {'-'*6} {'-'*6}")
    for row in quick_wins[:20]:
        page = row["keys"][0].replace(f"https://{SITE.replace('sc-domain:', '')}", "")[:54]
        print(f"  {page:<55} {int(row['impressions']):>8,} {int(row['clicks']):>7,} {row['ctr']*100:>5.1f}% {row['position']:>6.1f}")

    # --- Low CTR pages (high impressions, low CTR) ---
    print_section("LOW CTR PAGES (500+ impressions, CTR < 3%)")
    low_ctr = [
        row for row in r.get("rows", [])
        if row["impressions"] >= 500 and row["ctr"] < 0.03
    ]
    low_ctr.sort(key=lambda x: x["impressions"], reverse=True)
    print(f"  {'Page':<55} {'Impr':>8} {'Clicks':>7} {'CTR':>6} {'Pos':>6}")
    print(f"  {'-'*55} {'-'*8} {'-'*7} {'-'*6} {'-'*6}")
    for row in low_ctr[:20]:
        page = row["keys"][0].replace(f"https://{SITE.replace('sc-domain:', '')}", "")[:54]
        print(f"  {page:<55} {int(row['impressions']):>8,} {int(row['clicks']):>7,} {row['ctr']*100:>5.1f}% {row['position']:>6.1f}")

    # --- Top queries ---
    print_section("TOP 30 QUERIES BY IMPRESSIONS")
    r = query_gsc(service, ["query"])
    rows = sorted(r.get("rows", []), key=lambda x: x["impressions"], reverse=True)[:30]
    print(f"  {'Query':<45} {'Impr':>8} {'Clicks':>7} {'CTR':>6} {'Pos':>6}")
    print(f"  {'-'*45} {'-'*8} {'-'*7} {'-'*6} {'-'*6}")
    for row in rows:
        query = row["keys"][0][:44]
        print(f"  {query:<45} {int(row['impressions']):>8,} {int(row['clicks']):>7,} {row['ctr']*100:>5.1f}% {row['position']:>6.1f}")

    # --- Branded vs non-branded estimate ---
    print_section("BRANDED vs NON-BRANDED QUERIES (top 200)")
    r = query_gsc(service, ["query"], row_limit=200)
    rows = r.get("rows", [])
    brand = os.environ.get("BRAND_NAME", "").lower()
    branded_terms = [brand] if brand else []
    branded = [row for row in rows if any(t in row["keys"][0].lower() for t in branded_terms)]
    nonbranded = [row for row in rows if not any(t in row["keys"][0].lower() for t in branded_terms)]
    b_clicks = sum(r["clicks"] for r in branded)
    b_impr = sum(r["impressions"] for r in branded)
    nb_clicks = sum(r["clicks"] for r in nonbranded)
    nb_impr = sum(r["impressions"] for r in nonbranded)
    print(f"  Branded:     {int(b_clicks):>6,} clicks  {int(b_impr):>8,} impressions")
    print(f"  Non-branded: {int(nb_clicks):>6,} clicks  {int(nb_impr):>8,} impressions")

    print(f"\n{'='*60}")
    print("  Analysis complete.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
