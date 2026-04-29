import hmac
import os
import sys
from pathlib import Path

import streamlit as st
import streamlit.components.v1 as components

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
        [data-testid="stSidebar"] .stButton > button {
          justify-content: flex-start;
          background: rgba(255,255,255,.04) !important;
          border: 1px solid rgba(255,255,255,.08) !important;
          border-radius: 14px !important;
          color: #f8fafc !important;
          -webkit-text-fill-color: #f8fafc !important;
          font-weight: 750 !important;
          min-height: 48px;
          margin: 4px 0;
          padding: 8px 14px !important;
        }
        [data-testid="stSidebar"] .stButton > button *,
        [data-testid="stSidebar"] .stButton > button p {
          color: #f8fafc !important;
          -webkit-text-fill-color: #f8fafc !important;
        }
        [data-testid="stSidebar"] .stButton > button:hover {
          background: rgba(255,255,255,.10) !important;
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
        }

        [data-testid="stAlert"] {
          border-radius: 18px;
          border: 0;
        }
        [data-testid="stAlert"],
        [data-testid="stAlert"] *,
        [data-testid="stAlert"] p,
        [data-testid="stAlert"] div {
          color: #171923 !important;
          -webkit-text-fill-color: #171923 !important;
        }
        [data-testid="stAlert"][kind="warning"],
        [data-testid="stAlert"][data-baseweb*="warning"] {
          background: #fff6db !important;
        }
        [data-testid="stAlert"][kind="error"] {
          background: #feeceb !important;
        }
        [data-testid="stAlert"][kind="info"] {
          background: #eaf3ff !important;
        }
        [data-testid="stAlert"][kind="success"] {
          background: #e8f8ef !important;
        }
        .stDataFrame {
          border: 1px solid var(--ss-line);
          border-radius: 18px;
          box-shadow: var(--ss-shadow);
          overflow: hidden;
        }

        /* main-page radio controls */
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] > label,
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] > label *,
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] [role="radiogroup"] label,
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] [role="radiogroup"] label *,
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] [role="radiogroup"] p,
        div[data-testid="stAppViewContainer"] [data-testid="stRadio"] [role="radiogroup"] span,
        section.main [data-testid="stRadio"] label,
        section.main [data-testid="stRadio"] label *,
        section.main [data-testid="stRadio"] p,
        div[data-testid="stAppViewContainer"] > .main [data-testid="stRadio"] label,
        div[data-testid="stAppViewContainer"] > .main [data-testid="stRadio"] label *,
        div[data-testid="stAppViewContainer"] > .main [data-testid="stRadio"] p {
          color: #171923 !important;
        }
        div[data-testid="stAppViewContainer"] > .main [data-testid="stRadio"] [role="radiogroup"] label p {
          color: #374151 !important;
          font-weight: 700 !important;
        }
        [data-testid="stSidebar"] [data-testid="stRadio"] label,
        [data-testid="stSidebar"] [data-testid="stRadio"] label *,
        [data-testid="stSidebar"] [data-testid="stRadio"] [role="radiogroup"] label,
        [data-testid="stSidebar"] [data-testid="stRadio"] [role="radiogroup"] label *,
        [data-testid="stSidebar"] [data-testid="stRadio"] [role="radiogroup"] p,
        [data-testid="stSidebar"] [data-testid="stRadio"] [role="radiogroup"] span,
        [data-testid="stSidebar"] [data-testid="stRadio"] [data-testid="stMarkdownContainer"],
        [data-testid="stSidebar"] [data-testid="stRadio"] [data-testid="stMarkdownContainer"] * {
          color: #f8fafc !important;
          -webkit-text-fill-color: #f8fafc !important;
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

        /* segmented controls and tabs */
        [data-testid="stSegmentedControl"] label {
          color: #374151 !important;
        }
        [data-testid="stSegmentedControl"] label[data-checked="true"],
        [data-testid="stSegmentedControl"] input:checked + label {
          color: #111827 !important;
        }
        [data-baseweb="tab-list"] button,
        [data-baseweb="tab-list"] button p {
          color: #e5e7eb !important;
        }
        [data-baseweb="tab-list"] button[aria-selected="true"],
        [data-baseweb="tab-list"] button[aria-selected="true"] p {
          color: #111827 !important;
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


_PREVIEW_HTML = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #0d1117;
    height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px;
    overflow: hidden;
  }
  .wrap { width: 100%; max-width: 480px; }
  .eyebrow {
    font-size: 11px; font-weight: 700; letter-spacing: .10em;
    text-transform: uppercase; color: #f45b52; margin-bottom: 8px;
  }
  .heading {
    font-size: 22px; font-weight: 800; color: #f8fafc; margin-bottom: 22px;
  }
  /* metrics */
  .metrics { display: grid; grid-template-columns: repeat(3,1fr); gap: 10px; margin-bottom: 14px; }
  .metric {
    background: #161b27; border: 1px solid #1f2937; border-radius: 12px;
    padding: 14px; animation: fadeUp .5s ease both;
  }
  .metric:nth-child(2) { animation-delay:.1s; }
  .metric:nth-child(3) { animation-delay:.2s; }
  .m-label { font-size:10px; color:#6b7280; font-weight:600; text-transform:uppercase; letter-spacing:.04em; margin-bottom:5px; }
  .m-value { font-size:20px; font-weight:800; color:#f8fafc; font-variant-numeric:tabular-nums; }
  .m-delta { font-size:10px; color:#22c55e; font-weight:600; margin-top:3px; }
  /* chart */
  .chart-wrap {
    background:#161b27; border:1px solid #1f2937; border-radius:12px;
    padding:16px 18px 10px; margin-bottom:12px; animation:fadeUp .5s ease .3s both;
  }
  .chart-label { font-size:11px; color:#9ca3af; font-weight:600; margin-bottom:10px; }
  .chart-path {
    stroke-dasharray:700; stroke-dashoffset:700;
    animation:drawLine 2s ease .5s forwards;
  }
  .chart-path-2 {
    stroke-dasharray:700; stroke-dashoffset:700;
    animation:drawLine 2s ease .8s forwards;
  }
  /* bars */
  .bars {
    background:#161b27; border:1px solid #1f2937; border-radius:12px;
    padding:14px 18px; animation:fadeUp .5s ease .5s both;
  }
  .bar-row { display:flex; align-items:center; gap:10px; margin-bottom:9px; }
  .bar-row:last-child { margin-bottom:0; }
  .bar-name { font-size:10px; color:#9ca3af; font-weight:600; width:52px; flex-shrink:0; }
  .bar-track { flex:1; height:7px; background:#1f2937; border-radius:99px; overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; width:0; transition:width 1.4s cubic-bezier(.16,1,.3,1); }
  .bar-val { font-size:10px; color:#6b7280; width:32px; text-align:right; flex-shrink:0; }
  /* glow */
  .glow {
    position:fixed; top:-120px; right:-120px; width:360px; height:360px; border-radius:50%;
    background:radial-gradient(circle,rgba(244,91,82,.15) 0%,transparent 70%);
    pointer-events:none;
  }
  @keyframes drawLine { to { stroke-dashoffset:0; } }
  @keyframes fadeUp { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
</style>
</head>
<body>
<div class="glow"></div>
<div class="wrap">
  <div class="eyebrow">Live dashboard preview</div>
  <div class="heading">Everything in one view.</div>

  <div class="metrics">
    <div class="metric">
      <div class="m-label">Revenue</div>
      <div class="m-value" id="rev">$0</div>
      <div class="m-delta">↑ 18% vs last mo.</div>
    </div>
    <div class="metric">
      <div class="m-label">GSC Clicks</div>
      <div class="m-value" id="clicks">0</div>
      <div class="m-delta">↑ 34% vs last mo.</div>
    </div>
    <div class="metric">
      <div class="m-label">Amazon Orders</div>
      <div class="m-value" id="orders">0</div>
      <div class="m-delta">↑ 12% vs last mo.</div>
    </div>
  </div>

  <div class="chart-wrap">
    <div class="chart-label">GSC Clicks — last 90 days</div>
    <svg viewBox="0 0 460 80" fill="none" style="width:100%;display:block;">
      <defs>
        <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#f45b52" stop-opacity=".20"/>
          <stop offset="100%" stop-color="#f45b52" stop-opacity="0"/>
        </linearGradient>
      </defs>
      <path d="M0,65 C28,60 56,54 90,46 S160,30 200,26 S270,14 320,18 S400,8 460,4 L460,80 L0,80 Z" fill="url(#gfill)"/>
      <path class="chart-path"
            d="M0,65 C28,60 56,54 90,46 S160,30 200,26 S270,14 320,18 S400,8 460,4"
            stroke="#f45b52" stroke-width="2.5" fill="none" stroke-linecap="round"/>
      <path class="chart-path-2"
            d="M0,72 C28,70 56,68 90,64 S160,58 200,56 S270,50 320,48 S400,44 460,40"
            stroke="#ffb454" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".5"/>
    </svg>
  </div>

  <div class="bars">
    <div class="bar-row">
      <div class="bar-name">Shopify</div>
      <div class="bar-track"><div class="bar-fill" id="b1" style="background:#f45b52"></div></div>
      <div class="bar-val">$8.2k</div>
    </div>
    <div class="bar-row">
      <div class="bar-name">Amazon</div>
      <div class="bar-track"><div class="bar-fill" id="b2" style="background:#ffb454"></div></div>
      <div class="bar-val">$4.6k</div>
    </div>
    <div class="bar-row">
      <div class="bar-name">Organic</div>
      <div class="bar-track"><div class="bar-fill" id="b3" style="background:#818cf8"></div></div>
      <div class="bar-val">3.2k</div>
    </div>
  </div>
</div>

<script>
function countUp(id, target, prefix, dur) {
  var el = document.getElementById(id), start = null;
  function step(ts) {
    if (!start) start = ts;
    var p = Math.min((ts - start) / dur, 1);
    var ease = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.floor(ease * target).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
setTimeout(function() {
  countUp('rev', 12840, '$', 1800);
  countUp('clicks', 3241, '', 1800);
  countUp('orders', 284, '', 1800);
}, 400);
setTimeout(function() {
  [['b1',72],['b2',40],['b3',28]].forEach(function(b) {
    var el = document.getElementById(b[0]);
    if (el) el.style.width = b[1] + '%';
  });
}, 600);
</script>
</body>
</html>"""


def require_password() -> bool:
    password = _secret("DASHBOARD_PASSWORD")
    if not password:
        st.warning("Set `DASHBOARD_PASSWORD` before deploying this dashboard publicly.")
        return True

    if st.session_state.get("authenticated"):
        return True

    store = _store_name()

    st.markdown(f"""<style>
    .stApp {{ background: #0d1117 !important; }}
    [data-testid="stHeader"], footer, [data-testid="stToolbar"] {{ display: none !important; }}
    .block-container {{ max-width: 100% !important; padding: 0 !important; }}
    /* stretch columns to full viewport height */
    [data-testid="stHorizontalBlock"] {{
        gap: 0 !important;
        min-height: 100vh;
        align-items: stretch !important;
    }}
    /* left column — white panel */
    [data-testid="stHorizontalBlock"] > div:first-child {{
        background: #ffffff !important;
        padding: 0 48px !important;
        display: flex !important;
        flex-direction: column !important;
        justify-content: center !important;
    }}
    /* right column — keep dark, no padding so iframe fills it */
    [data-testid="stHorizontalBlock"] > div:last-child {{
        background: #0d1117 !important;
        padding: 0 !important;
    }}
    /* form widget styling scoped to the login page */
    [data-testid="stHorizontalBlock"] > div:first-child .stTextInput input {{
        border-radius: 10px !important;
        border: 1.5px solid #e5e7eb !important;
        padding: 10px 13px !important;
        font-size: 14px !important;
        background: #f9fafb !important;
        color: #111827 !important;
    }}
    [data-testid="stHorizontalBlock"] > div:first-child .stTextInput input:focus {{
        border-color: #f45b52 !important;
        box-shadow: 0 0 0 3px rgba(244,91,82,.12) !important;
        background: #fff !important;
    }}
    [data-testid="stHorizontalBlock"] > div:first-child .stButton > button {{
        width: 100% !important;
        background: #f45b52 !important;
        color: #fff !important;
        border: none !important;
        border-radius: 10px !important;
        font-size: 14px !important;
        font-weight: 700 !important;
        padding: 11px !important;
        margin-top: 4px !important;
    }}
    [data-testid="stHorizontalBlock"] > div:first-child .stButton > button:hover {{
        background: #d94840 !important;
    }}
    [data-testid="stHorizontalBlock"] > div:first-child .stTextInput label {{
        display: none !important;
    }}
    /* remove iframe border */
    [data-testid="stHorizontalBlock"] > div:last-child iframe {{
        border: none !important;
        display: block !important;
    }}
    </style>""", unsafe_allow_html=True)

    col_left, col_right = st.columns([2, 3])

    with col_left:
        st.markdown(f"""
        <div style="width:52px;height:52px;border-radius:14px;
             background:linear-gradient(135deg,#f45b52,#ffb454);
             display:grid;place-items:center;font-size:26px;
             box-shadow:0 12px 28px rgba(244,91,82,.30);margin-bottom:20px;">⛳</div>
        <div style="font-size:24px;font-weight:800;color:#0d1117;
             margin-bottom:8px;">{store} Analytics</div>
        <div style="font-size:14px;color:#6b7280;line-height:1.6;
             margin-bottom:28px;">Your unified Shopify, Amazon &amp; Search<br>
             command center. Private access only.</div>
        <div style="font-size:11px;font-weight:700;color:#374151;
             letter-spacing:.05em;text-transform:uppercase;
             margin-bottom:6px;">Password</div>
        """, unsafe_allow_html=True)

        entered = st.text_input("pw", type="password", placeholder="Enter password…", label_visibility="collapsed")
        if st.button("Sign in →", type="primary", use_container_width=True):
            if hmac.compare_digest(entered, password):
                st.session_state["authenticated"] = True
                st.rerun()
            else:
                st.error("Incorrect password.")
        st.markdown(
            '<p style="font-size:12px;color:#9ca3af;margin-top:16px;text-align:center;">'
            "🔒 Private dashboard — authorized access only</p>",
            unsafe_allow_html=True,
        )

    with col_right:
        components.html(_PREVIEW_HTML, height=700, scrolling=False)

    return False


def sidebar(selected=None):
    with st.sidebar:
        st.markdown(
            f"""
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
        if "selected_page" not in st.session_state:
            st.session_state["selected_page"] = selected if selected in page_names else page_names[0]
        page = st.session_state["selected_page"]
        if page not in page_names:
            page = page_names[0]
            st.session_state["selected_page"] = page

        for page_name in page_names:
            active = page_name == page
            marker = "●" if active else "○"
            label = f"{marker} {PAGES[page_name]['icon']} {page_name}"
            if st.button(label, key=f"nav_{page_name}", use_container_width=True):
                st.session_state["selected_page"] = page_name
                st.rerun()

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
