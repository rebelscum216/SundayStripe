import streamlit as st
import sys
from pathlib import Path
import requests

sys.path.insert(0, str(Path(__file__).parent.parent))


@st.cache_data(ttl=3600)
def _gsc_summary(days):
    from data.gsc import get_site_summary
    return get_site_summary(days)


@st.cache_data(ttl=3600)
def _revenue(days):
    from data.shopify import get_revenue_by_product
    return get_revenue_by_product(days)


@st.cache_data(ttl=3600)
def _seo_health():
    from data.shopify import get_seo_health
    return get_seo_health()


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="overview_refresh"):
            st.cache_data.clear()
            st.rerun()

    try:
        gsc_now = _gsc_summary(30)
        gsc_prev = _gsc_summary(60)
        prev_clicks = gsc_prev["clicks"] - gsc_now["clicks"]
        prev_impressions = gsc_prev["impressions"] - gsc_now["impressions"]
    except Exception as e:
        gsc_now = {"clicks": 0, "impressions": 0, "avg_ctr": 0, "avg_position": 0}
        prev_clicks = 0
        prev_impressions = 0
        st.warning(f"GSC unavailable: {e}")

    try:
        rev_rows = _revenue(30)
        total_rev = sum(r["revenue"] for r in rev_rows)
        rev_prev_rows = _revenue(60)
        total_rev_prev = sum(r["revenue"] for r in rev_prev_rows) - total_rev
    except requests.HTTPError as e:
        total_rev = 0
        total_rev_prev = 0
        if e.response is not None and e.response.status_code == 403:
            st.warning(
                "Shopify revenue unavailable: this Shopify token does not have order read access. "
                "Add `read_orders` to the Shopify app/token if you want revenue metrics."
            )
        else:
            st.warning(f"Shopify unavailable: {e}")
    except Exception as e:
        total_rev = 0
        total_rev_prev = 0
        st.warning(f"Shopify unavailable: {e}")

    from data.amazon import KNOWN_ASINS
    amazon_count = len(KNOWN_ASINS)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("GSC Clicks (30d)", gsc_now["clicks"], delta=int(gsc_now["clicks"] - prev_clicks))
    c2.metric("GSC Impressions (30d)", gsc_now["impressions"], delta=int(gsc_now["impressions"] - prev_impressions))
    c3.metric("Shopify Revenue (30d)", f"${total_rev:,.2f}", delta=f"${total_rev - total_rev_prev:,.2f}")
    c4.metric("Amazon ASINs tracked", amazon_count)

    st.divider()
    st.subheader("Action Items")

    alerts = []

    try:
        health = _seo_health()
        missing_title = [h for h in health if not h["has_seo_title"]]
        missing_desc = [h for h in health if not h["has_seo_description"]]
        if missing_title:
            alerts.append(("warning", f"{len(missing_title)} pages/products missing SEO title"))
        if missing_desc:
            alerts.append(("warning", f"{len(missing_desc)} pages/products missing SEO description"))
    except Exception:
        pass

    from data.amazon import KNOWN_ASINS
    if "amazon_listing_quality" in st.session_state:
        lq = st.session_state["amazon_listing_quality"]
        no_kw = [x for x in lq if not x["has_keywords"]]
        if no_kw:
            alerts.append(("error", f"{len(no_kw)} Amazon ASINs missing backend search keywords"))
        low_score = [x for x in lq if x["quality_score"] < 60]
        if low_score:
            alerts.append(("warning", f"{len(low_score)} Amazon listings with quality score < 60"))

    if not alerts:
        st.success("No critical issues detected.")
    else:
        for level, msg in alerts:
            if level == "error":
                st.error(msg)
            elif level == "warning":
                st.warning(msg)

    st.divider()
    st.subheader("Top Products by Revenue (30d)")
    try:
        rev_rows = _revenue(30)
        if rev_rows:
            import pandas as pd
            df = pd.DataFrame(rev_rows[:10])
            df["revenue"] = df["revenue"].apply(lambda x: f"${x:,.2f}")
            st.dataframe(df[["title", "units_sold", "revenue"]], width="stretch", hide_index=True)
        else:
            st.info("No order data in the last 30 days.")
    except Exception:
        pass
