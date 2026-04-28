import sys
from pathlib import Path

import pandas as pd
import streamlit as st

sys.path.insert(0, str(Path(__file__).parent.parent))

from ui import more_expander, split_preview


def _ensure_token():
    if "amazon_token" not in st.session_state:
        with st.spinner("Authenticating with Amazon SP-API..."):
            from data.amazon import get_lwa_token

            st.session_state["amazon_token"] = get_lwa_token()
    return st.session_state["amazon_token"]


@st.cache_data(ttl=3600)
def _inventory(token):
    from data.amazon import get_fba_inventory

    return get_fba_inventory(token)


@st.cache_data(ttl=3600)
def _shipments(token):
    from data.amazon import get_inbound_shipments

    return get_inbound_shipments(token)


def render():
    col_btn = st.columns([6, 1])[1]
    with col_btn:
        if st.button("Refresh", key="inventory_refresh"):
            st.cache_data.clear()
            st.rerun()

    try:
        token = _ensure_token()
        with st.spinner("Fetching FBA inventory..."):
            inventory = _inventory(token)
    except Exception as e:
        st.error(f"Could not load FBA inventory: {e}")
        st.caption("Confirm your Amazon app has the Amazon Fulfillment or Product Listing role.")
        return

    total_skus = len(inventory)
    fulfillable = sum(i["fulfillable"] for i in inventory)
    inbound = sum(i["inbound_total"] for i in inventory)
    reserved = sum(i["reserved_total"] for i in inventory)
    unfulfillable = sum(i["unfulfillable_total"] for i in inventory)
    out_of_stock = sum(1 for i in inventory if i["fulfillable"] <= 0)
    low_stock = sum(1 for i in inventory if 0 < i["fulfillable"] <= 5)

    c1, c2, c3, c4, c5, c6 = st.columns(6)
    c1.metric("FBA SKUs", total_skus)
    c2.metric("Fulfillable", fulfillable)
    c3.metric("Inbound", inbound)
    c4.metric("Reserved", reserved)
    c5.metric("Unfulfillable", unfulfillable)
    c6.metric("Out / low stock", f"{out_of_stock} / {low_stock}")

    if out_of_stock:
        st.error(f"{out_of_stock} FBA SKUs are out of stock.")
    if low_stock:
        st.warning(f"{low_stock} FBA SKUs have 1-5 fulfillable units.")
    if unfulfillable:
        st.warning(f"{unfulfillable} units are unfulfillable.")

    st.divider()
    st.subheader("Ask Amazon Inventory")
    st.caption("Ask about sales, top products, inbound shipments, current FBA inventory, and restock candidates. The AI creates a safe query plan; the app executes the Amazon API calls.")

    default_question = "What was my top selling product last month?"
    question = st.text_input(
        "Inventory question",
        value=st.session_state.get("inventory_ai_question", default_question),
        key="inventory_ai_question",
    )
    if st.button("Ask", key="inventory_ai_ask"):
        if not question.strip():
            st.warning("Type a question first.")
        else:
            try:
                with st.spinner("Planning query with OpenAI and checking Amazon orders..."):
                    from data.amazon_ai import execute_inventory_query

                    ai_result = execute_inventory_query(question, token, inventory, _shipments(token))
                st.session_state["inventory_ai_result"] = ai_result
            except Exception as e:
                st.error(f"Could not answer inventory question: {e}")

    ai_result = st.session_state.get("inventory_ai_result")
    if ai_result:
        st.success(ai_result["answer"])
        metric_items = list(ai_result.get("metrics", {}).items())[:5]
        if metric_items:
            cols = st.columns(len(metric_items))
            for col, (label, value) in zip(cols, metric_items):
                col.metric(label, value)

        with st.expander("Query plan", expanded=False):
            st.json(ai_result["plan"])

        tables = ai_result.get("tables", [])
        if tables:
            for table in tables:
                rows = table.get("rows", [])
                if not rows:
                    continue
                st.subheader(table.get("title", "Results"))
                preview, remaining = split_preview(rows, 8)
                st.dataframe(pd.DataFrame(preview), width="stretch", hide_index=True)
                if remaining:
                    with more_expander(f"Expand to view more {table.get('title', 'results').lower()}", len(remaining)):
                        st.dataframe(pd.DataFrame(remaining), width="stretch", hide_index=True)
        else:
            st.info("No matching Amazon rows found for that question.")

    st.divider()
    st.subheader("Inventory Detail")

    rows = []
    for i in inventory:
        rows.append(
            {
                "Product": i["product_name"],
                "ASIN": i["asin"],
                "Seller SKU": i["seller_sku"],
                "FNSKU": i["fnsku"],
                "Fulfillable": i["fulfillable"],
                "Inbound": i["inbound_total"],
                "Reserved": i["reserved_total"],
                "Unfulfillable": i["unfulfillable_total"],
                "Researching": i["researching_total"],
                "Total": i["total_quantity"],
                "Alerts": ", ".join(i["alerts"]),
            }
        )

    df = pd.DataFrame(rows)
    view = st.segmented_control(
        "View",
        ["All", "Out of stock", "Low stock", "Inbound", "Problems"],
        default="All",
        key="inventory_filter",
    )
    if not df.empty:
        if view == "Out of stock":
            df = df[df["Fulfillable"] <= 0]
        elif view == "Low stock":
            df = df[(df["Fulfillable"] > 0) & (df["Fulfillable"] <= 5)]
        elif view == "Inbound":
            df = df[df["Inbound"] > 0]
        elif view == "Problems":
            df = df[(df["Unfulfillable"] > 0) | (df["Researching"] > 0) | (df["Reserved"] > df["Fulfillable"])]

        st.dataframe(df, width="stretch", hide_index=True)
    else:
        st.info("No FBA inventory returned.")

    flagged = [i for i in inventory if i["alerts"]]
    if flagged:
        st.divider()
        st.subheader(f"Flagged SKUs ({len(flagged)})")

        preview, remaining = split_preview(flagged, 5)

        def render_flagged_sku(i):
            with st.expander(f"{i['seller_sku']} — {i['product_name']}"):
                c1, c2, c3, c4 = st.columns(4)
                c1.metric("Fulfillable", i["fulfillable"])
                c2.metric("Inbound", i["inbound_total"])
                c3.metric("Reserved", i["reserved_total"])
                c4.metric("Unfulfillable", i["unfulfillable_total"])
                st.caption(f"ASIN {i['asin']} | FNSKU {i['fnsku']} | {', '.join(i['alerts'])}")

        for i in preview:
            render_flagged_sku(i)

        if remaining:
            with more_expander("Expand to view more flagged SKUs", len(remaining)):
                for i in remaining:
                    render_flagged_sku(i)

    st.divider()
    st.subheader("Inbound Shipments")

    try:
        with st.spinner("Fetching inbound shipment plans..."):
            shipments = _shipments(token)
    except Exception as e:
        st.warning(f"Could not load inbound shipments: {e}")
        return

    active = sum(1 for s in shipments if s["status"] == "ACTIVE")
    shipped = sum(1 for s in shipments if s["status"] == "SHIPPED")
    shipment_count = sum(s["shipment_count"] for s in shipments)
    inbound_units = sum(s["item_quantity"] for s in shipments)

    c1, c2, c3, c4 = st.columns(4)
    c1.metric("Inbound plans", len(shipments))
    c2.metric("Active / shipped", f"{active} / {shipped}")
    c3.metric("Shipments", shipment_count)
    c4.metric("Units in plans", inbound_units)

    plan_rows = []
    for s in shipments:
        plan_rows.append(
            {
                "Status": s["status"],
                "Created": s["created_at"][:10],
                "Last Updated": s["last_updated_at"][:10],
                "Plan ID": s["inbound_plan_id"],
                "Shipments": s["shipment_count"],
                "Shipment Statuses": ", ".join(s["shipment_statuses"]),
                "SKUs": s["item_count"],
                "Units": s["item_quantity"],
                "Alerts": ", ".join(s["alerts"]),
            }
        )

    df_plans = pd.DataFrame(plan_rows)
    if not df_plans.empty:
        view = st.segmented_control(
            "Shipment view",
            ["All plans", "Active", "Shipped", "Needs attention"],
            default="All plans",
            key="shipment_filter",
        )
        if view == "Active":
            df_plans = df_plans[df_plans["Status"] == "ACTIVE"]
        elif view == "Shipped":
            df_plans = df_plans[df_plans["Status"] == "SHIPPED"]
        elif view == "Needs attention":
            df_plans = df_plans[df_plans["Alerts"] != ""]

        st.dataframe(df_plans, width="stretch", hide_index=True)
    else:
        st.info("No active or shipped inbound plans returned.")

    shipment_preview, shipment_remaining = split_preview(shipments, 5)

    def render_shipment_plan(s):
        title = s["name"] or s["inbound_plan_id"]
        with st.expander(f"{s['status']} — {title}"):
            c1, c2, c3, c4 = st.columns(4)
            c1.metric("Shipments", s["shipment_count"])
            c2.metric("SKUs", s["item_count"])
            c3.metric("Units", s["item_quantity"])
            c4.metric("Updated", s["last_updated_at"][:10] or "Unknown")
            if s["shipment_ids"]:
                st.caption("Shipment IDs: " + ", ".join(s["shipment_ids"]))
            if s["alerts"]:
                st.warning(", ".join(s["alerts"]))
            if s.get("detail_error"):
                st.caption(s["detail_error"])
            if s["items"]:
                st.dataframe(
                    pd.DataFrame(s["items"]).rename(
                        columns={
                            "msku": "MSKU",
                            "asin": "ASIN",
                            "fnsku": "FNSKU",
                            "quantity": "Quantity",
                            "label_owner": "Label Owner",
                        }
                    ),
                    width="stretch",
                    hide_index=True,
                )
            else:
                st.caption("No items returned for this plan.")

    for s in shipment_preview:
        render_shipment_plan(s)

    if shipment_remaining:
        with more_expander("Expand to view more inbound plans", len(shipment_remaining)):
            for s in shipment_remaining:
                render_shipment_plan(s)
