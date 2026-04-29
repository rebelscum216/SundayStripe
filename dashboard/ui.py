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

    store = _store_name()

    st.markdown(
        f"""
        <style>
        /* ── full-page login layout ── */
        .stApp {{ background: #0d1117 !important; }}
        .block-container {{ max-width: 100% !important; padding: 0 !important; }}
        [data-testid="stAppViewContainer"] > .main > .block-container {{ padding: 0 !important; }}

        /* hide header/footer on login */
        [data-testid="stHeader"], footer {{ display: none !important; }}

        /* column layout */
        .ss-login-root {{
            display: flex;
            min-height: 100vh;
        }}

        /* ── LEFT PANEL ── */
        .ss-login-left {{
            flex: 0 0 400px;
            background: #fff;
            display: flex;
            flex-direction: column;
            justify-content: center;
            padding: 56px 48px;
        }}
        .ss-login-logo {{
            width: 52px; height: 52px;
            border-radius: 14px;
            background: linear-gradient(135deg, #f45b52, #ffb454);
            display: grid; place-items: center;
            font-size: 26px;
            box-shadow: 0 12px 28px rgba(244,91,82,.30);
            margin-bottom: 24px;
        }}
        .ss-login-title {{
            font-size: 24px;
            font-weight: 860;
            color: #0d1117;
            margin-bottom: 6px;
        }}
        .ss-login-sub {{
            font-size: 14px;
            color: #70798b;
            line-height: 1.55;
            margin-bottom: 36px;
        }}
        .ss-login-label {{
            font-size: 12px;
            font-weight: 700;
            color: #374151;
            letter-spacing: .04em;
            text-transform: uppercase;
            margin-bottom: 6px;
        }}
        .ss-input-hint {{
            font-size: 12px;
            color: #9ca3af;
            margin-top: 20px;
            text-align: center;
        }}

        /* style the Streamlit input & button within left panel */
        .ss-form .stTextInput input {{
            border-radius: 10px !important;
            border: 1.5px solid #e5e7eb !important;
            padding: 10px 13px !important;
            font-size: 14px !important;
            background: #f9fafb !important;
        }}
        .ss-form .stTextInput input:focus {{
            border-color: #f45b52 !important;
            box-shadow: 0 0 0 3px rgba(244,91,82,.12) !important;
            background: #fff !important;
        }}
        .ss-form .stButton > button {{
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
        .ss-form .stButton > button:hover {{
            background: #d94840 !important;
        }}
        /* hide the text input label (we render our own) */
        .ss-form .stTextInput label {{ display: none !important; }}

        /* ── RIGHT PANEL ── */
        .ss-preview-panel {{
            flex: 1;
            background: #0d1117;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 48px;
            position: relative;
            overflow: hidden;
        }}
        .ss-preview-panel::before {{
            content: '';
            position: absolute;
            top: -200px; right: -200px;
            width: 500px; height: 500px;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(244,91,82,.18) 0%, transparent 70%);
            pointer-events: none;
        }}
        .ss-preview-inner {{
            width: 100%;
            max-width: 520px;
        }}
        .ss-preview-eyebrow {{
            font-size: 11px;
            font-weight: 700;
            letter-spacing: .1em;
            text-transform: uppercase;
            color: #f45b52;
            margin-bottom: 10px;
        }}
        .ss-preview-heading {{
            font-size: 20px;
            font-weight: 800;
            color: #f8fafc;
            margin-bottom: 24px;
        }}

        /* metric cards */
        .ss-prev-metrics {{
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 12px;
            margin-bottom: 20px;
        }}
        .ss-prev-metric {{
            background: #161b27;
            border: 1px solid #1f2937;
            border-radius: 14px;
            padding: 16px;
            animation: fadeUp .6s ease both;
        }}
        .ss-prev-metric:nth-child(2) {{ animation-delay: .1s; }}
        .ss-prev-metric:nth-child(3) {{ animation-delay: .2s; }}
        .ss-prev-m-label {{
            font-size: 11px;
            color: #6b7280;
            font-weight: 600;
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: .04em;
        }}
        .ss-prev-m-value {{
            font-size: 22px;
            font-weight: 800;
            color: #f8fafc;
            font-variant-numeric: tabular-nums;
        }}
        .ss-prev-m-delta {{
            font-size: 11px;
            color: #22c55e;
            font-weight: 600;
            margin-top: 4px;
        }}

        /* line chart */
        .ss-chart-wrap {{
            background: #161b27;
            border: 1px solid #1f2937;
            border-radius: 14px;
            padding: 18px 20px 12px;
            margin-bottom: 14px;
            animation: fadeUp .6s ease .3s both;
        }}
        .ss-chart-title {{
            font-size: 12px;
            color: #9ca3af;
            font-weight: 600;
            margin-bottom: 10px;
        }}
        .chart-path {{
            stroke-dasharray: 700;
            stroke-dashoffset: 700;
            animation: drawLine 2.2s ease .5s forwards;
        }}
        .chart-path-2 {{
            stroke-dasharray: 700;
            stroke-dashoffset: 700;
            animation: drawLine 2.2s ease .8s forwards;
        }}

        /* bar chart */
        .ss-bars {{
            background: #161b27;
            border: 1px solid #1f2937;
            border-radius: 14px;
            padding: 16px 20px;
            animation: fadeUp .6s ease .5s both;
        }}
        .ss-bar-row {{
            display: flex;
            align-items: center;
            gap: 10px;
            margin-bottom: 10px;
        }}
        .ss-bar-row:last-child {{ margin-bottom: 0; }}
        .ss-bar-name {{
            font-size: 11px;
            color: #9ca3af;
            font-weight: 600;
            width: 58px;
            flex-shrink: 0;
        }}
        .ss-bar-track {{
            flex: 1;
            height: 8px;
            background: #1f2937;
            border-radius: 99px;
            overflow: hidden;
        }}
        .ss-bar-fill {{
            height: 100%;
            border-radius: 99px;
            width: 0;
            transition: width 1.4s cubic-bezier(.16,1,.3,1);
        }}
        .ss-bar-val {{
            font-size: 11px;
            color: #6b7280;
            width: 32px;
            text-align: right;
            flex-shrink: 0;
        }}

        @keyframes drawLine {{
            to {{ stroke-dashoffset: 0; }}
        }}
        @keyframes fadeUp {{
            from {{ opacity: 0; transform: translateY(16px); }}
            to   {{ opacity: 1; transform: translateY(0); }}
        }}
        </style>

        <div class="ss-login-root">

          <!-- LEFT: login -->
          <div class="ss-login-left">
            <div class="ss-login-logo">⛳</div>
            <div class="ss-login-title">{store} Analytics</div>
            <div class="ss-login-sub">Your unified Shopify, Amazon &amp; Search<br>command center. Private access only.</div>
            <div class="ss-login-label">Password</div>
          </div>

          <!-- RIGHT: animated preview -->
          <div class="ss-preview-panel">
            <div class="ss-preview-inner">
              <div class="ss-preview-eyebrow">Live dashboard preview</div>
              <div class="ss-preview-heading">Everything in one view.</div>

              <div class="ss-prev-metrics">
                <div class="ss-prev-metric">
                  <div class="ss-prev-m-label">Revenue</div>
                  <div class="ss-prev-m-value" id="rev">$0</div>
                  <div class="ss-prev-m-delta">↑ 18% vs last mo.</div>
                </div>
                <div class="ss-prev-metric">
                  <div class="ss-prev-m-label">GSC Clicks</div>
                  <div class="ss-prev-m-value" id="clicks">0</div>
                  <div class="ss-prev-m-delta">↑ 34% vs last mo.</div>
                </div>
                <div class="ss-prev-metric">
                  <div class="ss-prev-m-label">Amazon Orders</div>
                  <div class="ss-prev-m-value" id="orders">0</div>
                  <div class="ss-prev-m-delta">↑ 12% vs last mo.</div>
                </div>
              </div>

              <div class="ss-chart-wrap">
                <div class="ss-chart-title">GSC Clicks — last 90 days</div>
                <svg viewBox="0 0 480 90" fill="none" xmlns="http://www.w3.org/2000/svg" style="width:100%;display:block;">
                  <defs>
                    <linearGradient id="gfill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stop-color="#f45b52" stop-opacity=".18"/>
                      <stop offset="100%" stop-color="#f45b52" stop-opacity="0"/>
                    </linearGradient>
                  </defs>
                  <path d="M0,72 C30,68 60,62 90,55 S150,38 190,34 S260,20 310,24 S390,14 480,8 L480,90 L0,90 Z"
                        fill="url(#gfill)"/>
                  <path class="chart-path"
                        d="M0,72 C30,68 60,62 90,55 S150,38 190,34 S260,20 310,24 S390,14 480,8"
                        stroke="#f45b52" stroke-width="2.5" fill="none" stroke-linecap="round"/>
                  <path class="chart-path-2"
                        d="M0,80 C30,76 60,74 90,70 S150,64 190,62 S260,56 310,54 S390,50 480,46"
                        stroke="#ffb454" stroke-width="1.5" fill="none" stroke-linecap="round" opacity=".5"/>
                </svg>
              </div>

              <div class="ss-bars">
                <div class="ss-bar-row">
                  <div class="ss-bar-name">Shopify</div>
                  <div class="ss-bar-track"><div class="ss-bar-fill" id="b1" style="background:#f45b52;"></div></div>
                  <div class="ss-bar-val">$8.2k</div>
                </div>
                <div class="ss-bar-row">
                  <div class="ss-bar-name">Amazon</div>
                  <div class="ss-bar-track"><div class="ss-bar-fill" id="b2" style="background:#ffb454;"></div></div>
                  <div class="ss-bar-val">$4.6k</div>
                </div>
                <div class="ss-bar-row">
                  <div class="ss-bar-name">Organic</div>
                  <div class="ss-bar-track"><div class="ss-bar-fill" id="b3" style="background:#818cf8;"></div></div>
                  <div class="ss-bar-val">3.2k</div>
                </div>
              </div>

            </div>
          </div>

        </div>

        <script>
        (function() {{
          function countUp(id, target, prefix, duration) {{
            var el = document.getElementById(id);
            if (!el) return;
            var start = null;
            function step(ts) {{
              if (!start) start = ts;
              var p = Math.min((ts - start) / duration, 1);
              var ease = 1 - Math.pow(1 - p, 3);
              var val = Math.floor(ease * target);
              el.textContent = prefix + val.toLocaleString();
              if (p < 1) requestAnimationFrame(step);
            }}
            requestAnimationFrame(step);
          }}
          setTimeout(function() {{
            countUp('rev',    12840, '$', 1800);
            countUp('clicks',  3241, '',  1800);
            countUp('orders',   284, '',  1800);
          }}, 400);

          setTimeout(function() {{
            var bars = [['b1', 72], ['b2', 40], ['b3', 28]];
            bars.forEach(function(b) {{
              var el = document.getElementById(b[0]);
              if (el) el.style.width = b[1] + '%';
            }});
          }}, 600);
        }})();
        </script>
        """,
        unsafe_allow_html=True,
    )

    # Streamlit form widgets — CSS above positions them inside the left panel visually
    with st.container():
        st.markdown('<div class="ss-form">', unsafe_allow_html=True)
        entered = st.text_input("pw", type="password", placeholder="Enter password…", label_visibility="collapsed")
        if st.button("Sign in →", type="primary", use_container_width=True):
            if hmac.compare_digest(entered, password):
                st.session_state["authenticated"] = True
                st.rerun()
            else:
                st.error("Incorrect password.")
        st.markdown('<p class="ss-input-hint">🔒 Private dashboard — authorized access only</p>', unsafe_allow_html=True)
        st.markdown("</div>", unsafe_allow_html=True)

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
