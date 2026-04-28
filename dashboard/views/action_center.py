import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from ui import task_card


@st.cache_data(ttl=3600)
def _gsc_quick_wins():
    from data.gsc import get_quick_wins

    return get_quick_wins(90)


@st.cache_data(ttl=3600)
def _merchant_health():
    from data.merchant import get_feed_health

    return get_feed_health()


def _amazon_token():
    if "amazon_token" not in st.session_state:
        from data.amazon import get_lwa_token

        st.session_state["amazon_token"] = get_lwa_token()
    return st.session_state["amazon_token"]


@st.cache_data(ttl=3600)
def _inventory(token):
    from data.amazon import get_fba_inventory

    return get_fba_inventory(token)


@st.cache_data(ttl=21600)
def _listings(token):
    from data.amazon import get_listing_quality

    return get_listing_quality(token)


@st.cache_data(ttl=3600)
def _shopify_seo():
    from data.shopify import get_seo_health

    return get_seo_health()


def render():
    st.write("")
    alerts = []

    try:
        inventory = _inventory(_amazon_token())
        out = [i for i in inventory if i["fulfillable"] <= 0]
        low = [i for i in inventory if 0 < i["fulfillable"] <= 5]
        unfulfillable = sum(i["unfulfillable_total"] for i in inventory)
        if out:
            alerts.append(("High", f"Restore {len(out)} Amazon FBA SKUs", "Out of stock in FBA. Review replenishment or pause promotion.", "bad"))
        if low:
            alerts.append(("Medium", f"Review {len(low)} low-stock FBA SKUs", "These have 1-5 fulfillable units remaining.", "warn"))
        if unfulfillable:
            alerts.append(("Medium", f"Resolve {unfulfillable} unfulfillable FBA units", "Damaged or defective units may need removal/disposal.", "warn"))
    except Exception as exc:
        alerts.append(("Setup", "Amazon inventory unavailable", str(exc), "warn"))

    try:
        listings = _listings(_amazon_token())
        no_kw = [x for x in listings if not x["has_keywords"]]
        low_score = [x for x in listings if x["quality_score"] < 60]
        if no_kw:
            alerts.append(("SEO", f"Add backend keywords to {len(no_kw)} ASINs", "Amazon search discoverability gap.", "warn"))
        if low_score:
            alerts.append(("Content", f"Improve {len(low_score)} low-score Amazon listings", "Missing bullets, description, keywords, or image depth.", "warn"))
    except Exception:
        pass

    try:
        merchant = _merchant_health()
        no_free = [p for p in merchant if not p["free_listings"]]
        issues = sum(p["issue_count"] for p in merchant)
        missing = [p for p in merchant if p["missing_fields"]]
        if issues:
            alerts.append(("High", f"Fix {issues} Google Merchant item issues", "Feed issues can block free listings and ads.", "bad"))
        if no_free:
            alerts.append(("High", f"Repair {len(no_free)} products not approved for free listings", "Recover Google Shopping organic coverage.", "bad"))
        if missing:
            alerts.append(("Medium", f"Complete feed fields for {len(missing)} products", "Missing title, description, image, price, availability, or brand.", "warn"))
    except Exception as exc:
        alerts.append(("Setup", "Google Merchant unavailable", str(exc), "warn"))

    try:
        health = _shopify_seo()
        missing_desc = [x for x in health if not x["has_seo_description"]]
        missing_title = [x for x in health if not x["has_seo_title"]]
        if missing_desc:
            alerts.append(("SEO", f"Add Shopify SEO descriptions to {len(missing_desc)} items", "Meta descriptions are missing from products/pages/collections.", "warn"))
        if missing_title:
            alerts.append(("SEO", f"Add Shopify SEO titles to {len(missing_title)} items", "Search snippets need stronger title tags.", "warn"))
    except Exception:
        pass

    try:
        wins = _gsc_quick_wins()
        if wins:
            alerts.append(("Opportunity", f"Optimize {len(wins)} GSC quick-win pages", "Pages ranking positions 5-20 with meaningful impressions.", "good"))
    except Exception:
        pass

    c1, c2, c3 = st.columns(3)
    high = sum(1 for a in alerts if a[3] == "bad")
    medium = sum(1 for a in alerts if a[3] == "warn")
    opportunities = sum(1 for a in alerts if a[3] == "good")
    c1.metric("High impact", high)
    c2.metric("Improve this week", medium)
    c3.metric("Opportunities", opportunities)

    st.divider()
    col_today, col_week, col_watch = st.columns(3)

    with col_today:
        st.subheader("Fix Today")
        items = [a for a in alerts if a[3] == "bad"]
        if items:
            for priority, title, detail, tone in items[:8]:
                task_card(priority, title, detail, tone)
        else:
            st.success("No high-impact issues detected.")

    with col_week:
        st.subheader("Improve This Week")
        items = [a for a in alerts if a[3] == "warn"]
        if items:
            for priority, title, detail, tone in items[:8]:
                task_card(priority, title, detail, tone)
        else:
            st.info("No medium-priority improvements queued.")

    with col_watch:
        st.subheader("Monitor")
        items = [a for a in alerts if a[3] == "good"]
        if items:
            for priority, title, detail, tone in items[:8]:
                task_card(priority, title, detail, tone)
        else:
            st.info("No watchlist opportunities yet.")
