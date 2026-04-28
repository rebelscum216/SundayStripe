import streamlit as st
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


@st.cache_data(ttl=3600)
def _gsc_pages(days):
    from data.gsc import get_pages
    return get_pages(days)


@st.cache_data(ttl=3600)
def _shopify_products():
    from data.shopify import get_products
    return get_products()


@st.cache_data(ttl=3600)
def _revenue(days):
    from data.shopify import get_revenue_by_product
    return get_revenue_by_product(days)


def _fuzzy_match(title: str, candidates: list):
    title_lower = title.lower()
    title_words = set(title_lower.split())
    best_score = 0
    best_asin = None
    for c in candidates:
        c_words = set(c["title"].lower().split())
        overlap = len(title_words & c_words)
        if overlap > best_score and overlap >= 2:
            best_score = overlap
            best_asin = c["asin"]
    return best_asin


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="cross_refresh"):
            st.cache_data.clear()
            st.rerun()

    days = st.radio("Date range", [30, 60, 90], horizontal=True, format_func=lambda x: f"{x} days", key="cross_days")

    try:
        gsc_pages = _gsc_pages(days)
        products = _shopify_products()
        rev_rows = _revenue(days)
    except Exception as e:
        st.error(f"Could not load data: {e}")
        return

    rev_by_pid = {r["product_id"]: r["revenue"] for r in rev_rows}
    gsc_by_path = {p["url"]: p for p in gsc_pages}
    amazon_listings = st.session_state.get("amazon_listing_quality", [])

    rows = []
    for product in products:
        product_path = product["url"]
        gsc = gsc_by_path.get(product_path, {})
        rev = rev_by_pid.get(product["id"], 0.0)

        matched_asin = _fuzzy_match(product["title"], amazon_listings) if amazon_listings else None
        amazon_item = next((x for x in amazon_listings if x["asin"] == matched_asin), None)

        rows.append(
            {
                "Product": product["title"],
                "GSC Impressions": gsc.get("impressions", 0),
                "GSC Position": gsc.get("position", 0) or "—",
                "GSC CTR%": gsc.get("ctr", 0) or "—",
                "Shopify Revenue": round(rev, 2),
                "Amazon ASIN": matched_asin or "—",
                "Amazon Score": amazon_item["quality_score"] if amazon_item else "—",
                "_flag_no_revenue": gsc.get("impressions", 0) > 200 and rev == 0,
                "_flag_no_amazon": rev > 0 and matched_asin is None,
            }
        )

    df = pd.DataFrame(rows)

    no_revenue = df[df["_flag_no_revenue"]]
    no_amazon = df[df["_flag_no_amazon"]]

    if not no_revenue.empty:
        st.warning(f"**{len(no_revenue)} products** get 200+ GSC impressions but $0 Shopify revenue — traffic not converting:")
        st.dataframe(no_revenue[["Product", "GSC Impressions", "GSC Position", "Shopify Revenue"]].reset_index(drop=True), width="stretch", hide_index=True)

    if not no_amazon.empty:
        st.info(f"**{len(no_amazon)} products** have Shopify sales but no Amazon listing — potential expansion:")
        st.dataframe(no_amazon[["Product", "Shopify Revenue", "Amazon ASIN"]].reset_index(drop=True), width="stretch", hide_index=True)

    st.divider()
    st.subheader("Full Cross-Channel View")
    display_cols = ["Product", "GSC Impressions", "GSC Position", "GSC CTR%", "Shopify Revenue", "Amazon ASIN", "Amazon Score"]
    df_display = df[display_cols].copy()
    df_display["Shopify Revenue"] = df_display["Shopify Revenue"].apply(lambda x: f"${x:,.2f}" if isinstance(x, (int, float)) else x)

    def highlight_rows(row):
        if row.get("_flag_no_revenue") if "_flag_no_revenue" in row.index else False:
            return ["background-color: #fff3cd"] * len(row)
        if row.get("_flag_no_amazon") if "_flag_no_amazon" in row.index else False:
            return ["background-color: #cce5ff"] * len(row)
        return [""] * len(row)

    st.dataframe(df_display, width="stretch", hide_index=True)

    if amazon_listings:
        st.caption("Amazon data loaded from session. Visit the Amazon tab first to ensure listings are fetched.")
    else:
        st.caption("Amazon quality scores not loaded yet — visit the Amazon tab to populate them.")
