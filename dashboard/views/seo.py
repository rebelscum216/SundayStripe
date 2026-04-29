import streamlit as st
import pandas as pd
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

GSC_VIEW_CACHE_VERSION = "gsc-v2-2026-04-28"


@st.cache_data(ttl=3600)
def _gsc_payload(days, cache_version):
    from data.gsc import (
        get_branded_split,
        get_clicks_by_date,
        get_low_ctr_pages,
        get_pages,
        get_queries,
        get_quick_wins,
        get_site_summary,
    )

    return {
        "summary": get_site_summary(days),
        "date_rows": get_clicks_by_date(days),
        "pages": get_pages(days),
        "queries": get_queries(days),
        "quick_wins": get_quick_wins(days),
        "low_ctr": get_low_ctr_pages(days),
        "branded": get_branded_split(days),
    }


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="seo_refresh"):
            st.cache_data.clear()
            st.rerun()

    days = st.radio("Date range", [30, 60, 90], horizontal=True, format_func=lambda x: f"{x} days", key="seo_days")

    try:
        payload = _gsc_payload(days, GSC_VIEW_CACHE_VERSION)
    except Exception as e:
        st.error(f"Could not load GSC data: {e}")
        return

    summary = payload["summary"]
    date_rows = payload["date_rows"]
    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Clicks", int(summary["clicks"]))
    c2.metric("Impressions", int(summary["impressions"]))
    c3.metric("CTR", f"{summary['avg_ctr']:.2f}%")
    c4.metric("Avg position", summary["avg_position"])

    if date_rows:
        import plotly.graph_objects as go
        df_date = pd.DataFrame(date_rows)
        fig = go.Figure()
        fig.add_trace(go.Scatter(x=df_date["date"], y=df_date["clicks"], name="Clicks", line=dict(color="#f45b52", width=2)))
        fig.add_trace(go.Scatter(x=df_date["date"], y=df_date["impressions"], name="Impressions", line=dict(color="#818cf8", width=2), yaxis="y2"))
        fig.update_layout(
            height=280, margin=dict(t=10, b=10, l=0, r=0),
            legend=dict(orientation="h", yanchor="bottom", y=1.02),
            font=dict(color="#171923"),
            yaxis=dict(title="Clicks", color="#374151", gridcolor="#e6e8ef", zerolinecolor="#d9dde7"),
            yaxis2=dict(title="Impressions", overlaying="y", side="right", color="#374151", gridcolor="#eef1f6"),
            xaxis=dict(color="#374151", gridcolor="#eef1f6"),
            plot_bgcolor="rgba(0,0,0,0)", paper_bgcolor="rgba(0,0,0,0)",
        )
        st.plotly_chart(fig, use_container_width=True)
    else:
        st.info("No date rows for this range. The account is connected, but Search Console returned an empty date series.")

    st.divider()
    col_left, col_right = st.columns(2)

    with col_left:
        st.subheader("Quick Wins (Position 5–20)")
        wins = payload["quick_wins"]
        if wins:
            df = pd.DataFrame(wins)

            def color_position(val):
                if val <= 10:
                    return "background-color: #d4edda"
                elif val <= 15:
                    return "background-color: #fff3cd"
                return "background-color: #f8d7da"

            styled = df.style.map(color_position, subset=["position"])
            st.dataframe(styled, width="stretch", hide_index=True)
        else:
            st.info("No quick wins found.")

    with col_right:
        st.subheader("Low CTR Pages (500+ impressions, <3%)")
        low = payload["low_ctr"]
        if low:
            df = pd.DataFrame(low)
            import plotly.express as px

            df_ctr = df[["url", "ctr"]].head(15)
            chart_height = min(520, max(240, 46 * len(df_ctr) + 90))
            fig = px.bar(
                df_ctr,
                x="ctr",
                y="url",
                orientation="h",
                text=df_ctr["ctr"].map(lambda value: f"{value:.2f}%"),
                labels={"ctr": "CTR", "url": "URL"},
            )
            fig.update_traces(marker_color="#f45b52", opacity=0.82, width=0.42, textposition="outside", cliponaxis=False)
            fig.update_layout(
                height=chart_height,
                margin=dict(t=10, b=40, l=180, r=70),
                bargap=0.55,
                font=dict(color="#171923"),
                plot_bgcolor="rgba(0,0,0,0)",
                paper_bgcolor="rgba(0,0,0,0)",
                xaxis=dict(
                    title="CTR",
                    color="#374151",
                    tickfont=dict(color="#6b7280"),
                    titlefont=dict(color="#374151"),
                    gridcolor="#e6e8ef",
                    zerolinecolor="#d9dde7",
                ),
                yaxis=dict(
                    title="",
                    autorange="reversed",
                    color="#374151",
                    tickfont=dict(color="#6b7280"),
                ),
            )
            st.plotly_chart(fig, use_container_width=True)
        else:
            st.info("No low-CTR pages found.")

    st.divider()
    col_brand, col_queries = st.columns(2)

    with col_brand:
        st.subheader("Branded vs Non-Branded")
        split = payload["branded"]
        try:
            import plotly.graph_objects as go
            labels = ["Branded", "Non-Branded"]
            values = [split["branded"]["clicks"], split["nonbranded"]["clicks"]]
            fig = go.Figure(data=[go.Pie(labels=labels, values=values, hole=0.4)])
            fig.update_layout(margin=dict(t=20, b=20, l=20, r=20), height=280)
            st.plotly_chart(fig, use_container_width=True)
        except ImportError:
            b = split["branded"]
            nb = split["nonbranded"]
            st.metric("Branded clicks", b["clicks"])
            st.metric("Non-branded clicks", nb["clicks"])

    with col_queries:
        st.subheader("Top Queries")
        queries = payload["queries"]
        if queries:
            df = pd.DataFrame(queries[:20])
            st.dataframe(df, width="stretch", hide_index=True)
        else:
            st.info("No query data.")

    st.divider()
    st.subheader("All Pages")
    pages = payload["pages"]
    if pages:
        df = pd.DataFrame(pages)
        st.dataframe(df, width="stretch", hide_index=True)
