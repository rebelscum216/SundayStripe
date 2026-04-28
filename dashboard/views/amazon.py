import streamlit as st
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from ui import more_expander, split_preview


def _ensure_token():
    if "amazon_token" not in st.session_state:
        with st.spinner("Authenticating with Amazon SP-API..."):
            from data.amazon import get_lwa_token
            st.session_state["amazon_token"] = get_lwa_token()
    return st.session_state["amazon_token"]


@st.cache_data(ttl=21600)
def _listing_quality(token):
    from data.amazon import get_listing_quality
    return get_listing_quality(token)


@st.cache_data(ttl=3600)
def _mkt_status(token):
    from data.amazon import get_marketplace_status
    return get_marketplace_status(token)


def _score_color(score):
    if score >= 80:
        return "background-color: #d4edda"
    elif score >= 60:
        return "background-color: #fff3cd"
    return "background-color: #f8d7da"


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="amazon_refresh"):
            st.cache_data.clear()
            if "amazon_token" in st.session_state:
                del st.session_state["amazon_token"]
            st.rerun()

    try:
        token = _ensure_token()
    except Exception as e:
        st.error(f"Amazon auth failed: {e}")
        return

    try:
        mkt = _mkt_status(token)
        for m in mkt:
            status = "Active" if m["is_active"] else "Inactive"
            flag = " — ⚠️ Suspended listings" if m["has_suspended_listings"] else ""
            st.caption(f"Marketplace: {m['name']} ({m['marketplace_id']}) — {status}{flag}")
    except Exception:
        pass

    st.divider()
    st.subheader("Listing Quality Scores")

    try:
        with st.spinner("Fetching listing data from Amazon..."):
            listings = _listing_quality(token)
        st.session_state["amazon_listing_quality"] = listings
    except Exception as e:
        st.error(f"Could not fetch listings: {e}")
        return

    no_kw = [x for x in listings if not x["has_keywords"]]
    if no_kw:
        st.error(f"⚠️ {len(no_kw)} ASINs missing backend search keywords — this hurts discoverability significantly")

    rows = []
    for item in listings:
        rows.append(
            {
                "ASIN": item["asin"],
                "Title": item["title"],
                "Score": item["quality_score"],
                "Title Len": item["title_length"],
                "Bullets": item["bullet_count"],
                "Desc": "✅" if item["has_description"] else "❌",
                "Keywords": "✅" if item["has_keywords"] else "❌",
                "Images": item["image_count"],
            }
        )

    df = pd.DataFrame(rows)
    styled = df.style.map(_score_color, subset=["Score"])
    st.dataframe(styled, width="stretch", hide_index=True)

    st.divider()
    st.subheader(f"Per-ASIN Detail ({len(listings)})")

    preview, remaining = split_preview(listings, 5)

    def render_listing_detail(item):
        with st.expander(f"{item['asin']} — Score: {item['quality_score']}/100"):
            c1, c2, c3, c4, c5 = st.columns(5)
            c1.metric("Title chars", item["title_length"])
            c2.metric("Bullets", f"{item['bullet_count']}/5")
            c3.metric("Description", "Yes" if item["has_description"] else "No")
            c4.metric("Keywords", "Yes" if item["has_keywords"] else "No")
            c5.metric("Images", item["image_count"])
            st.caption(f"Title: {item['title']}")
            if item["issues"]:
                for issue in item["issues"]:
                    st.warning(issue)
            else:
                st.success("All listing fields complete.")

    for item in preview:
        render_listing_detail(item)

    if remaining:
        with more_expander("Expand to view more ASINs", len(remaining)):
            for item in remaining:
                render_listing_detail(item)
