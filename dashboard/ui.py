import hmac
import os
import sys
from pathlib import Path

import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))
from data._config import cfg


def _store_name() -> str:
    return cfg("STORE_NAME", "My Store")


PAGES = {
    "Overview": {
        "icon": "📊",
        "eyebrow": "Unified commerce visibility",
        "title": f"{_store_name()} Analytics",
        "subtitle": "Search, store, marketplace, inventory, and feed health in one operating view.",
    },
    "Action Center": {
        "icon": "✅",
        "eyebrow": "Daily operating system",
        "title": "Action Center",
        "subtitle": "The highest-impact fixes collected from every channel.",
    },
    "Google SEO": {
        "icon": "🔎",
        "eyebrow": "Organic search",
        "title": "Google Search Console",
        "subtitle": "Find quick wins, query opportunities, and pages that need stronger CTR.",
    },
    "Shopify": {
        "icon": "🛍️",
        "eyebrow": "Store catalog",
        "title": "Shopify",
        "subtitle": "Products, collections, SEO metadata, and revenue health.",
    },
    "Amazon": {
        "icon": "📦",
        "eyebrow": "Marketplace content",
        "title": "Amazon Listings",
        "subtitle": "Listing quality, discoverability gaps, and account marketplace status.",
    },
    "Inventory": {
        "icon": "📦",
        "eyebrow": "FBA operations",
        "title": "Amazon Inventory",
        "subtitle": "Current FBA stock, low-stock flags, and shipments headed to Amazon.",
    },
    "Google Merchant": {
        "icon": "🏷️",
        "eyebrow": "Shopping feed",
        "title": "Google Merchant",
        "subtitle": "Feed approvals, missing fields, and listing destination coverage.",
    },
    "Cross-Channel": {
        "icon": "🔗",
        "eyebrow": "Product intelligence",
        "title": "Cross-Channel",
        "subtitle": "Compare search demand, Shopify performance, and Amazon readiness.",
    },
}


def inject_css():
    st.markdown(
        """
        <style>
        :root {
          --ss-bg: #f6f7fb;
          --ss-panel: #ffffff;
          --ss-ink: #171923;
          --ss-muted: #70798b;
          --ss-line: #e6e8ef;
          --ss-brand: #f45b52;
          --ss-brand-2: #ffb454;
          --ss-good: #18a058;
          --ss-warn: #b97900;
          --ss-bad: #d83a34;
          --ss-shadow: 0 20px 50px rgba(20,29,55,.08);
          --ss-radius: 22px;
        }

        .stApp { background: var(--ss-bg); color: var(--ss-ink); }
        .block-container { max-width: 1480px; padding-top: 1.35rem; padding-bottom: 4rem; }

        [data-testid="stSidebar"] {
          background: #111827;
          border-right: 0;
        }
        [data-testid="stSidebar"] * { color: #f8fafc; }
        [data-testid="stSidebar"] [data-testid="stRadio"] label {
          background: rgba(255,255,255,.04);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 14px;
          padding: 8px 10px;
          margin: 4px 0;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label:hover {
          background: rgba(255,255,255,.10);
        }
        [data-testid="stSidebar"] [data-testid="stMarkdownContainer"] p {
          color: #cdd5e1;
        }

        h1, h2, h3 { letter-spacing: 0; color: #242938; }
        h1 { font-weight: 800; }
        h2 { font-weight: 800; }

        div[data-testid="stMetric"] {
          background: var(--ss-panel);
          border: 1px solid var(--ss-line);
          border-radius: var(--ss-radius);
          padding: 18px 18px 16px;
          box-shadow: var(--ss-shadow);
        }
        div[data-testid="stMetric"] label p {
          color: var(--ss-muted);
          font-weight: 700;
          font-size: .86rem;
        }
        div[data-testid="stMetricValue"] {
          color: var(--ss-ink);
          font-weight: 800;
        }

        .stButton > button {
          border-radius: 14px;
          border: 1px solid var(--ss-line);
          background: #fff;
          font-weight: 750;
          min-height: 42px;
        }
        .stButton > button:hover {
          border-color: var(--ss-brand);
          color: var(--ss-brand);
        }

        [data-testid="stAlert"] {
          border-radius: 18px;
          border: 0;
        }
        .stDataFrame {
          border: 1px solid var(--ss-line);
          border-radius: 18px;
          box-shadow: var(--ss-shadow);
          overflow: hidden;
        }

        .ss-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 4px 0 24px;
        }
        .ss-logo {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          background: linear-gradient(135deg, var(--ss-brand), var(--ss-brand-2));
          display: grid;
          place-items: center;
          font-size: 24px;
          box-shadow: 0 14px 30px rgba(244,91,82,.24);
        }
        .ss-brand-title {
          font-size: 22px;
          line-height: 1.02;
          font-weight: 850;
          color: #fff;
        }
        .ss-brand-sub {
          color: #9ca3af;
          font-size: 12px;
          font-weight: 750;
        }
        .ss-side-card {
          margin-top: 22px;
          padding: 16px;
          border: 1px solid rgba(255,255,255,.12);
          border-radius: 18px;
          background: rgba(255,255,255,.06);
          color: #cdd5e1;
          font-size: 13px;
          line-height: 1.45;
        }
        .ss-side-card b {
          color: #fff;
          display: block;
          margin-bottom: 6px;
        }
        .ss-topbar {
          min-height: 64px;
          background: rgba(255,255,255,.78);
          backdrop-filter: blur(14px);
          border: 1px solid var(--ss-line);
          border-radius: 22px;
          padding: 13px 16px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          box-shadow: var(--ss-shadow);
          margin-bottom: 28px;
        }
        .ss-search {
          border: 1px solid var(--ss-line);
          border-radius: 14px;
          padding: 11px 14px;
          background: #fff;
          color: var(--ss-muted);
          min-width: min(420px, 100%);
          font-weight: 650;
        }
        .ss-live {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border-radius: 999px;
          padding: 8px 11px;
          background: #e8f8ef;
          color: #11683c;
          font-size: 12px;
          font-weight: 850;
        }
        .ss-hero {
          display: flex;
          justify-content: space-between;
          align-items: flex-end;
          gap: 24px;
          margin-bottom: 22px;
        }
        .ss-eyebrow {
          color: var(--ss-muted);
          text-transform: uppercase;
          font-size: 12px;
          letter-spacing: .08em;
          font-weight: 850;
        }
        .ss-hero h1 {
          margin: 8px 0 6px;
          font-size: clamp(32px, 4vw, 48px);
          line-height: 1.04;
        }
        .ss-subtitle {
          color: var(--ss-muted);
          font-size: 15px;
          font-weight: 560;
        }
        .ss-card {
          background: var(--ss-panel);
          border: 1px solid var(--ss-line);
          border-radius: var(--ss-radius);
          box-shadow: var(--ss-shadow);
          padding: 20px;
        }
        .ss-card h3 {
          margin: 0 0 8px;
          font-size: 18px;
        }
        .ss-muted { color: var(--ss-muted); }
        .ss-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 12px;
          font-weight: 850;
        }
        .ss-pill.good { background:#e8f8ef; color:#11683c; }
        .ss-pill.warn { background:#fff6db; color:#8a5b00; }
        .ss-pill.bad { background:#feeceb; color:#a72b26; }
        .ss-task {
          border: 1px solid var(--ss-line);
          border-radius: 18px;
          background: #fff;
          padding: 15px;
          margin-bottom: 12px;
        }
        .ss-task b {
          display: block;
          margin: 8px 0 5px;
          color: var(--ss-ink);
        }
        </style>
        """,
        unsafe_allow_html=True,
    )


def _secret(name: str, default: str = "") -> str:
    try:
        value = st.secrets.get(name, default)
    except Exception:
        value = default
    return os.environ.get(name) or value or default


def require_password() -> bool:
    password = _secret("DASHBOARD_PASSWORD")
    if not password:
        st.warning("Set `DASHBOARD_PASSWORD` before deploying this dashboard publicly.")
        return True

    if st.session_state.get("authenticated"):
        return True

    st.markdown(
        """
        <div style="max-width:520px;margin:12vh auto 24px;">
          <div class="ss-card">
            <div class="ss-brand" style="margin-bottom:14px;">
              <div class="ss-logo">⛳</div>
              <div>
                <div style="font-size:24px;font-weight:850;color:#171923;">{_store_name()} Analytics</div>
                <div class="ss-muted">Enter the dashboard password to continue.</div>
              </div>
            </div>
          </div>
        </div>
        """,
        unsafe_allow_html=True,
    )
    entered = st.text_input("Password", type="password", label_visibility="collapsed")
    if st.button("Sign in", type="primary"):
        if hmac.compare_digest(entered, password):
            st.session_state["authenticated"] = True
            st.rerun()
        st.error("Incorrect password.")
    return False


def sidebar(selected=None):
    with st.sidebar:
        st.markdown(
            """
            <div class="ss-brand">
              <div class="ss-logo">⛳</div>
              <div>
                <div class="ss-brand-title">{_store_name()}</div>
                <div class="ss-brand-sub">Analytics Command</div>
              </div>
            </div>
            """,
            unsafe_allow_html=True,
        )
        page_names = list(PAGES.keys())
        index = page_names.index(selected) if selected in page_names else 0
        page = st.radio(
            "Navigation",
            page_names,
            index=index,
            format_func=lambda name: f"{PAGES[name]['icon']} {name}",
            label_visibility="collapsed",
        )
        st.markdown(
            """
            <div class="ss-side-card">
              <b>Command center mode</b>
              Prioritize issues first, then drill into each channel for detail.
            </div>
            """,
            unsafe_allow_html=True,
        )
    return page


def chrome(page_name: str):
    meta = PAGES[page_name]
    col_left, col_right = st.columns([5, 1])
    with col_left:
        st.markdown(
            """
            <div class="ss-topbar">
              <div class="ss-search">Search products, ASINs, SKUs, pages...</div>
              <div class="ss-live">● Live APIs connected</div>
            </div>
            """,
            unsafe_allow_html=True,
        )
    with col_right:
        st.write("")
        if st.button("Refresh data", key="global_refresh"):
            st.cache_data.clear()
            st.rerun()

    st.markdown(
        f"""
        <section class="ss-hero">
          <div>
            <div class="ss-eyebrow">{meta['eyebrow']}</div>
            <h1>{meta['title']}</h1>
            <div class="ss-subtitle">{meta['subtitle']}</div>
          </div>
        </section>
        """,
        unsafe_allow_html=True,
    )


def task_card(priority: str, title: str, detail: str, tone: str = "warn"):
    st.markdown(
        f"""
        <div class="ss-task">
          <span class="ss-pill {tone}">{priority}</span>
          <b>{title}</b>
          <div class="ss-muted">{detail}</div>
        </div>
        """,
        unsafe_allow_html=True,
    )


def split_preview(items, limit=5):
    items = list(items or [])
    return items[:limit], items[limit:]


def more_expander(label: str, remaining_count: int):
    return st.expander(f"{label} ({remaining_count} more)", expanded=False)
