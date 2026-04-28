import sys
from pathlib import Path
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent))

from ui import chrome, inject_css, require_password, sidebar

st.set_page_config(
    page_title="Sunday Stripe Analytics",
    page_icon="⛳",
    layout="wide",
)

inject_css()

if not require_password():
    st.stop()

page = sidebar()
chrome(page)

if page == "Overview":
    from views.overview import render
    render()
elif page == "Action Center":
    from views.action_center import render
    render()
elif page == "Google SEO":
    from views.seo import render as seo_render
    seo_render()
elif page == "Shopify":
    from views.shopify import render as shopify_render
    shopify_render()
elif page == "Amazon":
    from views.amazon import render as amazon_render
    amazon_render()
elif page == "Inventory":
    from views.inventory import render as inventory_render
    inventory_render()
elif page == "Google Merchant":
    from views.merchant import render as merchant_render
    merchant_render()
elif page == "Cross-Channel":
    from views.cross_channel import render as cross_render
    cross_render()
