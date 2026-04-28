import sys
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from ui import more_expander, split_preview


@st.cache_data(ttl=3600)
def _feed_health():
    from data.merchant import get_feed_health

    return get_feed_health()


@st.cache_data(ttl=3600)
def _accounts():
    from data.merchant import list_accounts

    return list_accounts()


def _yn(value):
    return "Yes" if value else "No"


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="merchant_refresh"):
            st.cache_data.clear()
            st.rerun()

    try:
        accounts = _accounts()
        if accounts:
            account = accounts[0]
            st.caption(
                f"Merchant Center: {account.get('accountName', 'Unknown')} "
                f"({account.get('accountId', '')})"
            )
    except Exception as e:
        st.warning(f"Could not load Merchant Center account details: {e}")

    try:
        with st.spinner("Fetching Google Merchant product feed..."):
            products = _feed_health()
    except Exception as e:
        st.error(f"Could not load Google Merchant data: {e}")
        return

    total = len(products)
    free = sum(1 for p in products if p["free_listings"])
    shopping = sum(1 for p in products if p["shopping_ads"])
    issue_count = sum(p["issue_count"] for p in products)
    missing_count = sum(1 for p in products if p["missing_fields"])

    c1, c2, c3, c4, c5 = st.columns(5)
    c1.metric("Products", total)
    c2.metric("Free listings", free)
    c3.metric("Shopping ads", shopping)
    c4.metric("Products missing fields", missing_count)
    c5.metric("Google issues", issue_count)

    if total and free < total:
        st.warning(f"{total - free} products are not approved for free listings.")
    if issue_count:
        st.error(f"{issue_count} Merchant Center item issues found.")
    if missing_count:
        st.warning(f"{missing_count} products are missing one or more core feed fields.")

    st.divider()
    st.subheader("Feed Health")

    rows = []
    for p in products:
        rows.append(
            {
                "Title": p["title"],
                "Offer ID": p["offer_id"],
                "SKU": p["sku"],
                "Availability": p["availability"],
                "Price": p["price"],
                "Free Listings": _yn(p["free_listings"]),
                "Shopping Ads": _yn(p["shopping_ads"]),
                "Images": p["image_count"],
                "Desc Len": p["description_length"],
                "Issues": p["issue_count"],
                "Missing": ", ".join(p["missing_fields"]),
                "Approved": ", ".join(p["approved_destinations"]),
            }
        )

    df = pd.DataFrame(rows)
    if not df.empty:
        show_only = st.segmented_control(
            "View",
            ["All", "Problems", "Free listings gaps", "Shopping ads gaps"],
            default="All",
            key="merchant_filter",
        )
        if show_only == "Problems":
            df = df[(df["Issues"] > 0) | (df["Missing"] != "")]
        elif show_only == "Free listings gaps":
            df = df[df["Free Listings"] == "No"]
        elif show_only == "Shopping ads gaps":
            df = df[df["Shopping Ads"] == "No"]

        st.dataframe(df, width="stretch", hide_index=True)
    else:
        st.info("No Merchant Center products returned.")

    problem_products = [p for p in products if p["issue_count"] or p["missing_fields"]]
    if problem_products:
        st.divider()
        st.subheader(f"Issue Detail ({len(problem_products)})")

        preview, remaining = split_preview(problem_products, 5)

        def render_problem_product(p):
            label = p["title"] or p["offer_id"]
            with st.expander(label):
                if p["missing_fields"]:
                    st.warning("Missing fields: " + ", ".join(p["missing_fields"]))
                if p["issues"]:
                    issue_rows = []
                    for issue in p["issues"]:
                        issue_rows.append(
                            {
                                "Code": issue.get("code", ""),
                                "Severity": issue.get("severity", ""),
                                "Resolution": issue.get("resolution", ""),
                                "Description": issue.get("description", ""),
                                "Detail": issue.get("detail", ""),
                            }
                        )
                    st.dataframe(pd.DataFrame(issue_rows), width="stretch", hide_index=True)
                st.caption(p["link"])

        for p in preview:
            render_problem_product(p)

        if remaining:
            with more_expander("Expand to view more issue details", len(remaining)):
                for p in remaining:
                    render_problem_product(p)
