import streamlit as st
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))


@st.cache_data(ttl=3600)
def _products():
    from data.shopify import get_products
    return get_products()


@st.cache_data(ttl=3600)
def _revenue(days):
    from data.shopify import get_revenue_by_product
    return get_revenue_by_product(days)


@st.cache_data(ttl=3600)
def _collections():
    from data.shopify import get_collections
    return get_collections()


@st.cache_data(ttl=3600)
def _seo_health():
    from data.shopify import get_seo_health
    return get_seo_health()


def _yn(val):
    return "✅" if val else "❌"


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="shopify_refresh"):
            st.cache_data.clear()
            st.rerun()

    try:
        products = _products()
    except Exception as e:
        st.error(f"Could not load Shopify data: {e}")
        return

    st.subheader(f"Products ({len(products)} active)")
    if products:
        rows = []
        for p in products:
            rows.append(
                {
                    "Title": p["title"],
                    "URL": p["url"],
                    "Inventory": p["total_inventory"],
                    "Price": f"${p['price_min']:.2f}" if p["price_min"] == p["price_max"] else f"${p['price_min']:.2f}–${p['price_max']:.2f}",
                    "SEO Title": _yn(p["seo_title"]),
                    "SEO Desc": _yn(p["seo_description"]),
                    "Images": p["image_count"],
                }
            )
        df = pd.DataFrame(rows)
        st.dataframe(df, width="stretch", hide_index=True)

    st.divider()
    st.subheader("Revenue by Product (30d)")
    days = st.radio("Period", [30, 60, 90], horizontal=True, format_func=lambda x: f"{x} days", key="shopify_rev_days")
    try:
        rev = _revenue(days)
        if rev:
            df_rev = pd.DataFrame(rev[:15])
            import plotly.express as px

            chart_height = min(520, max(240, 54 * len(df_rev) + 90))
            fig = px.bar(
                df_rev,
                x="revenue",
                y="title",
                orientation="h",
                text=df_rev["revenue"].map(lambda value: f"${value:,.2f}"),
                labels={"revenue": "Revenue", "title": "Product"},
            )
            fig.update_traces(marker_color="#f45b52", opacity=0.82, width=0.42, textposition="outside", cliponaxis=False)
            fig.update_layout(
                height=chart_height,
                margin=dict(t=10, b=40, l=220, r=90),
                bargap=0.55,
                font=dict(color="#171923"),
                plot_bgcolor="rgba(0,0,0,0)",
                paper_bgcolor="rgba(0,0,0,0)",
                xaxis=dict(title="Revenue", color="#374151", gridcolor="#e6e8ef", zerolinecolor="#d9dde7"),
                yaxis=dict(title="", autorange="reversed", color="#374151"),
            )
            st.plotly_chart(fig, use_container_width=True)
            df_rev["revenue"] = df_rev["revenue"].apply(lambda x: f"${x:,.2f}")
            st.dataframe(df_rev[["title", "units_sold", "revenue"]], width="stretch", hide_index=True)
        else:
            st.info("No orders in this period.")
    except Exception as e:
        st.warning(f"Revenue data unavailable: {e}")

    st.divider()
    st.subheader("SEO Health")
    try:
        health = _seo_health()
        rows = []
        for h in health:
            rows.append(
                {
                    "Type": h["type"],
                    "Title": h["title"],
                    "URL": h["url"],
                    "SEO Title": _yn(h["has_seo_title"]),
                    "SEO Desc": _yn(h["has_seo_description"]),
                    "Title Len": h["seo_title_length"],
                    "Desc Len": h["seo_description_length"],
                }
            )
        df_health = pd.DataFrame(rows)
        incomplete = df_health[(df_health["SEO Title"] == "❌") | (df_health["SEO Desc"] == "❌")]
        if not incomplete.empty:
            st.warning(f"{len(incomplete)} items missing SEO metadata")
        st.dataframe(df_health, width="stretch", hide_index=True)
    except Exception as e:
        st.warning(f"SEO health unavailable: {e}")

    st.divider()
    st.subheader("Collections")
    try:
        colls = _collections()
        if colls:
            rows = [
                {
                    "Title": c["title"],
                    "URL": c["url"],
                    "Type": c["type"],
                    "SEO Title": _yn(c["seo_title"]),
                    "SEO Desc": _yn(c["seo_description"]),
                }
                for c in colls
            ]
            st.dataframe(pd.DataFrame(rows), width="stretch", hide_index=True)
    except Exception as e:
        st.warning(f"Collections unavailable: {e}")
