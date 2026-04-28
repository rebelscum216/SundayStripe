#!/usr/bin/env python3
"""
Amazon SP-API analysis for Sunday Stripe seller account
"""
import os, json, csv, io, time, requests
from datetime import datetime, timedelta
from requests_aws4auth import AWS4Auth

ENV_FILE = os.path.join(os.path.dirname(__file__), '..', '.env')
env = {}
with open(ENV_FILE) as f:
    for line in f:
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, v = line.split('=', 1)
            env[k.strip()] = v.strip()

CLIENT_ID      = env.get('AMAZON_CLIENT_ID_PROD') or env['AMAZON_CLIENT_ID']
CLIENT_SECRET  = env.get('AMAZON_SECRET_PROD') or env['AMAZON_CLIENT_SECRET']
REFRESH_TOKEN  = env.get('AMAZON_REFRESH_TOKEN_PROD') or env['AMAZON_REFRESH_TOKEN']
MARKETPLACE_ID = env['AMAZON_MARKETPLACE_ID']
REGION         = env['AMAZON_REGION']
AWS_KEY        = env['AWS_ACCESS_KEY_ID']
AWS_SECRET     = env['AWS_SECRET_ACCESS_KEY']
BASE_URL       = "https://sellingpartnerapi-na.amazon.com"


def get_lwa_token():
    r = requests.post("https://api.amazon.com/auth/o2/token", data={
        "grant_type": "refresh_token", "refresh_token": REFRESH_TOKEN,
        "client_id": CLIENT_ID, "client_secret": CLIENT_SECRET,
    })
    r.raise_for_status()
    return r.json()["access_token"]


def sp(method, path, params=None, body=None, token=None):
    auth = AWS4Auth(AWS_KEY, AWS_SECRET, REGION, "execute-api")
    headers = {"x-amz-access-token": token, "Content-Type": "application/json"}
    r = requests.request(method, BASE_URL + path, auth=auth,
                         headers=headers, params=params, json=body)
    return r


def section(title):
    print(f"\n{'='*60}\n  {title}\n{'='*60}")


def main():
    print("Authenticating...")
    token = get_lwa_token()
    print("✅ Connected to Amazon SP-API (production)\n")

    # --- Marketplace overview ---
    section("MARKETPLACE PARTICIPATIONS")
    r = sp("GET", "/sellers/v1/marketplaceParticipations", token=token)
    seller_id = None
    if r.status_code == 200:
        for p in r.json().get("payload", []):
            mkt  = p.get("marketplace", {})
            part = p.get("participation", {})
            flag = " [SUSPENDED]" if part.get("hasSuspendedListings") else ""
            print(f"  {mkt.get('name')} ({mkt.get('id')}) — "
                  f"{'Active' if part.get('isParticipating') else 'Inactive'}{flag}")

    # --- Search catalog for Sunday Stripe products ---
    section("SUNDAY STRIPE PRODUCTS ON AMAZON")
    keywords = ["sunday stripe golf glove", "sunday stripe golf shirt", "sunday stripe hoodie"]
    found_asins = {}
    for kw in keywords:
        r = sp("GET", "/catalog/2022-04-01/items",
               params={
                   "marketplaceIds": MARKETPLACE_ID,
                   "keywords": kw,
                   "includedData": "summaries,attributes,images",
                   "pageSize": 5,
               }, token=token)
        if r.status_code == 200:
            items = r.json().get("items", [])
            for item in items:
                asin = item.get("asin")
                summ = item.get("summaries", [{}])[0]
                brand = summ.get("brand", "")
                if "sunday" in brand.lower() or "sunday" in summ.get("itemName","").lower():
                    found_asins[asin] = item

    if found_asins:
        print(f"  Found {len(found_asins)} Sunday Stripe ASIN(s)\n")
        for asin, item in found_asins.items():
            summ  = item.get("summaries", [{}])[0]
            attrs = item.get("attributes", {})
            imgs  = item.get("images", [{}])

            title    = summ.get("itemName", "No title")
            bullets  = attrs.get("bullet_point", [])
            desc     = attrs.get("product_description", [{}])[0].get("value", "") if attrs.get("product_description") else ""
            keywords_val = attrs.get("generic_keyword", [{}])[0].get("value", "") if attrs.get("generic_keyword") else ""
            num_imgs = sum(len(i.get("images", [])) for i in imgs)

            print(f"  ASIN: {asin}")
            print(f"  Title ({len(title)} chars): {title[:100]}")
            print(f"  Bullets: {len(bullets)}/5")
            print(f"  Description: {'✅' if desc else '❌ MISSING'}")
            print(f"  Backend keywords: {'✅' if keywords_val else '❌ MISSING'}")
            print(f"  Images: {num_imgs}")

            issues = []
            if len(title) < 100:    issues.append(f"title short ({len(title)} chars — aim for 150+)")
            if len(bullets) < 5:    issues.append(f"only {len(bullets)} bullet points (use all 5)")
            if not desc:            issues.append("no product description")
            if not keywords_val:    issues.append("no backend search keywords")
            if num_imgs < 6:        issues.append(f"only {num_imgs} images (aim for 6+)")
            print(f"  Issues: {'; '.join(issues) if issues else '✅ None'}\n")
    else:
        print("  No Sunday Stripe products found via keyword search.")
        print("  (Try running with your specific ASINs below)\n")

    # --- Request + retrieve sales/traffic report ---
    section("SALES & TRAFFIC REPORT (last 30 days)")
    end   = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    start = (datetime.utcnow() - timedelta(days=30)).strftime("%Y-%m-%dT%H:%M:%SZ")
    r = sp("POST", "/reports/2021-06-30/reports", body={
        "reportType": "GET_SALES_AND_TRAFFIC_REPORT",
        "marketplaceIds": [MARKETPLACE_ID],
        "dataStartTime": start,
        "dataEndTime": end,
        "reportOptions": {"dateGranularity": "MONTH"},
    }, token=token)

    if r.status_code in (200, 202):
        report_id = r.json().get("reportId")
        print(f"  Report ID: {report_id} — waiting for processing ", end="", flush=True)
        for _ in range(12):
            time.sleep(10)
            print(".", end="", flush=True)
            rs = sp("GET", f"/reports/2021-06-30/reports/{report_id}", token=token)
            if rs.status_code == 200:
                status = rs.json().get("processingStatus")
                if status == "DONE":
                    doc_id = rs.json().get("reportDocumentId")
                    doc = sp("GET", f"/reports/2021-06-30/documents/{doc_id}", token=token)
                    if doc.status_code == 200:
                        doc_url = doc.json().get("url")
                        content = requests.get(doc_url).text
                        reader = csv.DictReader(io.StringIO(content), delimiter='\t')
                        rows = list(reader)
                        print(f"\n\n  {'Metric':<35} {'Value':>15}")
                        print(f"  {'-'*35} {'-'*15}")
                        for row in rows[:5]:
                            for k, v in row.items():
                                if any(x in k.lower() for x in ['session','unit','revenue','conversion','pageview']):
                                    print(f"  {k:<35} {v:>15}")
                    break
                elif status in ("FATAL", "CANCELLED"):
                    print(f"\n  Report failed: {status}")
                    break
        else:
            print(f"\n  Report still processing — check later with ID: {report_id}")
    else:
        print(f"  Error {r.status_code}: {r.text[:200]}")

    # --- Request merchant listings report ---
    section("MERCHANT LISTINGS REPORT")
    r = sp("POST", "/reports/2021-06-30/reports", body={
        "reportType": "GET_MERCHANT_LISTINGS_ALL_DATA",
        "marketplaceIds": [MARKETPLACE_ID],
    }, token=token)
    if r.status_code in (200, 202):
        report_id = r.json().get("reportId")
        print(f"  Listings report requested (ID: {report_id})")
        print(f"  Re-run in a few minutes to see all your SKUs, ASINs, titles, and prices.")
    else:
        print(f"  Error {r.status_code}: {r.text[:200]}")

    section("Analysis complete")


if __name__ == "__main__":
    main()
