#!/usr/bin/env python3
"""
Apply GSC-informed SEO updates to sundaystripe.com via Shopify Admin API
"""
import json, requests, sys

TOKEN_FILE = "/Users/andrewsmith/.config/shopify/token.json"
API_VERSION = "2026-04"

with open(TOKEN_FILE) as f:
    creds = json.load(f)

SHOP  = creds["shop"]
TOKEN = creds["access_token"]
BASE  = f"https://{SHOP}/admin/api/{API_VERSION}"
HEADERS = {"X-Shopify-Access-Token": TOKEN, "Content-Type": "application/json"}


def get(path, params=None):
    r = requests.get(f"{BASE}{path}", headers=HEADERS, params=params)
    r.raise_for_status()
    return r.json()

def put(path, body):
    r = requests.put(f"{BASE}{path}", headers=HEADERS, json=body)
    r.raise_for_status()
    return r.json()

def set_metafields(owner_id, owner_resource, seo_title, seo_desc):
    existing = get(f"/{owner_resource}/{owner_id}/metafields.json",
                   params={"namespace": "global"}).get("metafields", [])
    existing_map = {m["key"]: m["id"] for m in existing}

    for key, value in [("title_tag", seo_title), ("description_tag", seo_desc)]:
        body = {"metafield": {
            "namespace": "global", "key": key,
            "value": value, "type": "single_line_text_field"
        }}
        if key in existing_map:
            put(f"/{owner_resource}/{owner_id}/metafields/{existing_map[key]}.json", body)
            print(f"    updated {key}")
        else:
            r = requests.post(f"{BASE}/{owner_resource}/{owner_id}/metafields.json",
                              headers=HEADERS, json=body)
            r.raise_for_status()
            print(f"    created {key}")

def update_product(handle, new_title=None, new_handle=None, seo_title=None, seo_desc=None):
    data = get("/products.json", params={"handle": handle})
    products = data.get("products", [])
    if not products:
        print(f"  ✗ product not found: {handle}")
        return
    p = products[0]
    pid = p["id"]
    print(f"  product: {p['title']} (id {pid})")

    update = {}
    if new_title:  update["title"] = new_title
    if new_handle: update["handle"] = new_handle
    if update:
        put(f"/products/{pid}.json", {"product": {"id": pid, **update}})
        print(f"    updated title/handle")

    if seo_title or seo_desc:
        set_metafields(pid, "products", seo_title or p["title"], seo_desc or "")

def update_page(handle, seo_title=None, seo_desc=None):
    data = get("/pages.json", params={"handle": handle})
    pages = data.get("pages", [])
    if not pages:
        print(f"  ✗ page not found: {handle}")
        return
    pg = pages[0]
    pid = pg["id"]
    print(f"  page: {pg['title']} (id {pid})")
    set_metafields(pid, "pages", seo_title or pg["title"], seo_desc or "")

def update_collection(handle, seo_title=None, seo_desc=None):
    for kind in ("custom_collections", "smart_collections"):
        data = get(f"/{kind}.json", params={"handle": handle})
        colls = data.get(kind.replace("_", "_"), [])
        if not colls:
            colls = data.get("custom_collections", data.get("smart_collections", []))
        if colls:
            c = colls[0]
            cid = c["id"]
            print(f"  collection: {c['title']} (id {cid})")
            set_metafields(cid, kind, seo_title or c["title"], seo_desc or "")
            return
    print(f"  ✗ collection not found: {handle}")


print("\n=== Shopify SEO Updates ===\n")

print("1. Unisex T-Shirt → Sunday Stripe Golf T-Shirt")
update_product(
    handle="unisex-t-shirt-1",
    new_title="Sunday Stripe Golf T-Shirt",
    new_handle="golf-t-shirt",
    seo_title="Funny Golf T-Shirts | Sunday Stripe",
    seo_desc="Stand out on the course with Sunday Stripe golf t-shirts. Bold stripes, skull graphics, and uniquely fun designs for golfers who don't take themselves too seriously."
)

print("\n2. Pure White Golf Glove")
update_product(
    handle="sunday-stripe-pure-white-golf-glove",
    seo_title="Sunday Stripe Pure White Golf Glove | Clean & Classic",
    seo_desc="The Sunday Stripe Pure White Golf Glove — premium fit, clean look, built for golfers who like their game bold and their glove classic. Shop now."
)

print("\n3. Send It Golf Glove")
update_product(
    handle="sunday-stripe-send-it-golf-glove",
    seo_title="Send It Golf Glove | Sunday Stripe",
    seo_desc="The Send It Golf Glove by Sunday Stripe. Bold style meets performance grip — for golfers who commit to every shot."
)

print("\n4. Funny Golf Gloves page")
update_page(
    handle="funny-golf-gloves",
    seo_title="Funny Golf Gloves | Sunday Stripe",
    seo_desc="Looking for funny golf gloves? Sunday Stripe makes bold, unique golf gloves that stand out on the course. Shop our full collection of novelty and fun golf gloves."
)

print("\n5. Golf Gloves collection")
update_collection(
    handle="golf-gloves",
    seo_title="Funny & Unique Golf Gloves | Sunday Stripe",
    seo_desc="Shop Sunday Stripe's collection of funny, novelty, and unique golf gloves. Bold designs, quality fit — golf gloves that get noticed."
)

print("\n6. Hoodies & Sweatshirts collection")
update_collection(
    handle="hoodies-sweatshirts",
    seo_title="Golf Hoodies & Sweatshirts | Sunday Stripe",
    seo_desc="Bold golf hoodies and sweatshirts from Sunday Stripe. Unique stripe and skull designs built for golfers who play in style."
)

print("\n=== Done ===\n")
