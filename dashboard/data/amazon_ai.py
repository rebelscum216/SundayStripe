import json
import os
import re
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path

import requests

_DIR = Path(__file__).parent.parent
ENV_FILE = _DIR.parent / ".env"


def _load_env() -> dict:
    env = {}
    if ENV_FILE.exists():
        with open(ENV_FILE) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith("#") and "=" in line:
                    k, v = line.split("=", 1)
                    env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _env(name: str, default: str = "") -> str:
    env = _load_env()
    return os.environ.get(name) or env.get(name) or default


def _month_bounds(today: date, offset: int):
    first = today.replace(day=1)
    month_end = first - timedelta(days=1) if offset < 0 else first
    for _ in range(abs(offset) - 1):
        month_end = month_end.replace(day=1) - timedelta(days=1)
    start = month_end.replace(day=1)
    end = month_end + timedelta(days=1)
    return start, end


def _date_range(label: str):
    today = date.today()
    label = label or "last_30_days"
    if label == "last_month":
        return _month_bounds(today, -1)
    if label == "this_month":
        return today.replace(day=1), today + timedelta(days=1)
    if label == "last_90_days":
        return today - timedelta(days=90), today + timedelta(days=1)
    if label == "last_7_days":
        return today - timedelta(days=7), today + timedelta(days=1)
    return today - timedelta(days=30), today + timedelta(days=1)


def _candidate_catalog(inventory: list, shipments: list) -> list:
    candidates = {}
    for item in inventory:
        key = item.get("seller_sku") or item.get("asin")
        if not key:
            continue
        candidates[key] = {
            "seller_sku": item.get("seller_sku", ""),
            "asin": item.get("asin", ""),
            "fnsku": item.get("fnsku", ""),
            "title": item.get("product_name", ""),
        }
    for shipment in shipments:
        for item in shipment.get("items", []):
            key = item.get("msku") or item.get("asin")
            if not key or key in candidates:
                continue
            candidates[key] = {
                "seller_sku": item.get("msku", ""),
                "asin": item.get("asin", ""),
                "fnsku": item.get("fnsku", ""),
                "title": "",
            }
    return list(candidates.values())[:250]


def plan_inventory_query(question: str, inventory: list, shipments: list) -> dict:
    api_key = _env("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Set OPENAI_API_KEY in .env or hosted secrets to use AI inventory questions.")

    model = _env("OPENAI_MODEL", "gpt-5.4-mini")
    catalog = _candidate_catalog(inventory, shipments)
    schema = {
        "name": "amazon_business_query_plan",
        "strict": True,
        "schema": {
            "type": "object",
            "additionalProperties": False,
            "properties": {
                "operation": {
                    "type": "string",
                    "enum": [
                        "product_metrics",
                        "top_sellers",
                        "sales_summary",
                        "inventory_status",
                        "shipment_summary",
                        "replenishment_candidates",
                    ],
                },
                "date_range": {
                    "type": "string",
                    "enum": ["last_7_days", "last_30_days", "last_90_days", "last_month", "this_month"],
                },
                "product_terms": {"type": "array", "items": {"type": "string"}},
                "metrics": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": [
                            "shipped_to_amazon",
                            "sold_units",
                            "sales_revenue",
                            "current_inventory",
                            "inbound_inventory",
                            "low_stock",
                            "out_of_stock",
                        ],
                    },
                },
                "sort_by": {
                    "type": "string",
                    "enum": [
                        "sold_units",
                        "sales_revenue",
                        "shipped_to_amazon",
                        "current_inventory",
                        "inbound_inventory",
                        "stock_risk",
                    ],
                },
                "limit": {"type": "integer", "minimum": 1, "maximum": 50},
                "reason": {"type": "string"},
            },
            "required": ["operation", "date_range", "product_terms", "metrics", "sort_by", "limit", "reason"],
        },
    }
    body = {
        "model": model,
        "messages": [
            {
                "role": "system",
                "content": (
                    "Convert the user's Amazon seller question into a safe query plan. "
                    "Pick one operation. Use product_terms only for SKUs, ASINs, sizes, colors, or product phrases explicitly named in the user's question. "
                    "For broad questions like top sellers, out of stock, low stock, what shipped, or what to restock, leave product_terms empty. "
                    "Do not copy available_products_sample into product_terms unless the user clearly named that product. "
                    "Use top_sellers for questions like top product, best seller, most sold, or most revenue. "
                    "Use sales_summary for revenue, units sold, or order totals over time. "
                    "Use inventory_status for current stock, low stock, out of stock, reserved, or inbound inventory questions. "
                    "Use shipment_summary for shipments sent to Amazon, inbound plans, shipped units, or receiving questions. "
                    "Use replenishment_candidates for reorder, restock, running out, or what to send next. "
                    "Do not invent APIs, SQL, credentials, or code."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {
                        "today": str(date.today()),
                        "question": question,
                        "available_products_sample": catalog[:100],
                    }
                ),
            },
        ],
        "response_format": {"type": "json_schema", "json_schema": schema},
    }
    response = requests.post(
        "https://api.openai.com/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
        json=body,
        timeout=30,
    )
    response.raise_for_status()
    content = response.json()["choices"][0]["message"]["content"]
    return json.loads(content)


def _tokens(text: str) -> set:
    return {t for t in re.split(r"[^a-z0-9]+", (text or "").lower()) if len(t) >= 2}


def _identifier_terms(terms: list) -> list:
    identifiers = []
    for term in terms or []:
        value = term.strip()
        if re.fullmatch(r"B0[A-Z0-9]{8}", value.upper()) or re.fullmatch(r"[A-Z0-9]{2,}-[A-Z0-9-]{3,}", value.upper()):
            identifiers.append(value.lower())
    return identifiers


def _matches(row: dict, terms: list) -> bool:
    if not terms:
        return True
    ids = _identifier_terms(terms)
    if ids:
        id_haystack = " ".join(
            str(row.get(k, ""))
            for k in ["seller_sku", "SellerSKU", "sku", "msku", "asin", "ASIN", "fnsku", "FNSKU"]
        ).lower()
        if id_haystack:
            return any(identifier in id_haystack for identifier in ids)

    haystack = " ".join(str(v) for v in row.values()).lower()
    hay_tokens = _tokens(haystack)
    for term in terms:
        term_l = term.lower().strip()
        if not term_l:
            continue
        if term_l in haystack:
            return True
        term_tokens = _tokens(term_l)
        if term_tokens and len(term_tokens & hay_tokens) >= min(2, len(term_tokens)):
            return True
    return False


def _date_in_range(value: str, start: date, end: date) -> bool:
    if not value:
        return False
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00")).date()
    except ValueError:
        return False
    return start <= parsed < end


def _order_qty(row: dict) -> int:
    return row.get("quantity_shipped") or row.get("quantity_ordered", 0) or 0


def _product_key(row: dict) -> tuple:
    return (
        row.get("seller_sku") or row.get("msku") or "",
        row.get("asin") or "",
        row.get("title") or row.get("product_name") or "",
    )


def _summarize_orders(orders: list, terms: list, limit: int, sort_by: str) -> list:
    grouped = defaultdict(lambda: {"SKU": "", "ASIN": "", "Product": "", "Sold Units": 0, "Revenue": 0.0, "Orders": set()})
    for row in orders:
        if not _matches(row, terms):
            continue
        sku, asin, title = _product_key(row)
        key = (sku, asin, title)
        grouped[key]["SKU"] = sku
        grouped[key]["ASIN"] = asin
        grouped[key]["Product"] = title
        grouped[key]["Sold Units"] += _order_qty(row)
        grouped[key]["Revenue"] += float(row.get("item_price", 0) or 0)
        grouped[key]["Orders"].add(row.get("amazon_order_id", ""))

    rows = []
    for row in grouped.values():
        row["Orders"] = len({order_id for order_id in row["Orders"] if order_id})
        row["Revenue"] = round(row["Revenue"], 2)
        rows.append(row)

    order_key = "Revenue" if sort_by == "sales_revenue" else "Sold Units"
    rows.sort(key=lambda r: (r.get(order_key, 0), r.get("Revenue", 0)), reverse=True)
    return rows[:limit]


def _summarize_shipments(shipments: list, terms: list, start: date, end: date, limit: int, sort_by: str) -> list:
    grouped = defaultdict(lambda: {"SKU": "", "ASIN": "", "Shipped Units": 0, "Plans": set(), "Latest Status": "", "Latest Created": ""})
    for shipment in shipments:
        if not _date_in_range(shipment.get("created_at", ""), start, end):
            continue
        for item in shipment.get("items", []):
            if not _matches(item, terms):
                continue
            key = (item.get("msku", ""), item.get("asin", ""))
            grouped[key]["SKU"] = item.get("msku", "")
            grouped[key]["ASIN"] = item.get("asin", "")
            grouped[key]["Shipped Units"] += item.get("quantity", 0) or 0
            grouped[key]["Plans"].add(shipment.get("inbound_plan_id", ""))
            grouped[key]["Latest Status"] = shipment.get("status", "")
            grouped[key]["Latest Created"] = max(grouped[key]["Latest Created"], shipment.get("created_at", "")[:10])

    rows = []
    for row in grouped.values():
        row["Plans"] = len({plan for plan in row["Plans"] if plan})
        rows.append(row)

    rows.sort(key=lambda r: r.get("Shipped Units", 0), reverse=(sort_by != "current_inventory"))
    return rows[:limit]


def _shipment_units(shipments: list, terms: list, start: date, end: date) -> int:
    total = 0
    for shipment in shipments:
        if not _date_in_range(shipment.get("created_at", ""), start, end):
            continue
        for item in shipment.get("items", []):
            if _matches(item, terms):
                total += item.get("quantity", 0) or 0
    return total


def _inventory_rows(inventory: list, terms: list, limit: int) -> list:
    rows = []
    for row in inventory:
        if not _matches(row, terms):
            continue
        rows.append(
            {
                "SKU": row.get("seller_sku", ""),
                "ASIN": row.get("asin", ""),
                "Product": row.get("product_name", ""),
                "Fulfillable": row.get("fulfillable", 0),
                "Inbound": row.get("inbound_total", 0),
                "Reserved": row.get("reserved_total", 0),
                "Unfulfillable": row.get("unfulfillable_total", 0),
                "Alerts": ", ".join(row.get("alerts", [])),
            }
        )
    rows.sort(key=lambda r: (r["Fulfillable"], -r["Inbound"], r["Product"]))
    return rows[:limit]


def _status_rows(inventory: list, terms: list, question: str, limit: int) -> list:
    rows = _inventory_rows(inventory, terms, 500)
    q = question.lower()
    if "out" in q:
        rows = [row for row in rows if row["Fulfillable"] <= 0]
    elif "low" in q:
        rows = [row for row in rows if 0 < row["Fulfillable"] <= 5]
    elif "inbound" in q:
        rows = [row for row in rows if row["Inbound"] > 0]
    elif "problem" in q or "issue" in q or "flag" in q:
        rows = [row for row in rows if row["Alerts"]]
    return rows[:limit]


def _replenishment_rows(inventory: list, orders: list, terms: list, days: int, limit: int) -> list:
    sold_by_sku = defaultdict(int)
    for row in orders:
        if _matches(row, terms):
            sold_by_sku[row.get("seller_sku", "")] += _order_qty(row)

    rows = []
    for item in inventory:
        if not _matches(item, terms):
            continue
        sku = item.get("seller_sku", "")
        sold = sold_by_sku.get(sku, 0)
        daily = sold / max(days, 1)
        fulfillable = item.get("fulfillable", 0) or 0
        inbound = item.get("inbound_total", 0) or 0
        cover = None if daily <= 0 else round((fulfillable + inbound) / daily, 1)
        risk_score = (sold * 10) - (fulfillable + inbound)
        if fulfillable <= 5 or (cover is not None and cover <= 21):
            rows.append(
                {
                    "SKU": sku,
                    "ASIN": item.get("asin", ""),
                    "Product": item.get("product_name", ""),
                    "Sold Units": sold,
                    "Fulfillable": fulfillable,
                    "Inbound": inbound,
                    "Days Cover": "No recent sales" if cover is None else cover,
                    "Risk Score": round(risk_score, 1),
                }
            )
    rows.sort(key=lambda r: (r["Risk Score"], r["Sold Units"]), reverse=True)
    return rows[:limit]


def _format_period(start: date, end: date) -> str:
    return f"{start} to {end - timedelta(days=1)}"


def execute_inventory_query(question: str, token: str, inventory: list, shipments: list) -> dict:
    try:
        from data.amazon import get_orders_with_items
    except ModuleNotFoundError:
        from dashboard.data.amazon import get_orders_with_items

    plan = plan_inventory_query(question, inventory, shipments)
    start, end = _date_range(plan["date_range"])
    terms = plan.get("product_terms", [])
    limit = plan.get("limit", 10)
    sort_by = plan.get("sort_by", "sold_units")
    operation = plan.get("operation", "product_metrics")

    orders = get_orders_with_items(token, str(start), str(end))
    matched_orders = [row for row in orders if _matches(row, terms)]
    matched_inventory = [row for row in inventory if _matches(row, terms)]
    order_summary = _summarize_orders(orders, terms, limit, sort_by)
    detail_limit = max(limit, 50)
    shipment_summary = _summarize_shipments(shipments, terms, start, end, detail_limit, sort_by)
    inventory_summary = _inventory_rows(inventory, terms, detail_limit)

    sold_units = sum(_order_qty(row) for row in matched_orders)
    sales_revenue = round(sum(float(row.get("item_price", 0) or 0) for row in matched_orders), 2)
    shipped_units = _shipment_units(shipments, terms, start, end)
    current_units = sum(row.get("fulfillable", 0) or 0 for row in matched_inventory)
    inbound_units = sum(row.get("inbound_total", 0) or 0 for row in matched_inventory)
    period = _format_period(start, end)

    metrics = {
        "Sold units": sold_units,
        "Sales revenue": f"${sales_revenue:,.2f}",
        "Shipped to Amazon": shipped_units,
        "Current fulfillable": current_units,
        "Inbound now": inbound_units,
    }
    tables = []

    if operation == "top_sellers":
        top = order_summary
        tables.append({"title": "Top Selling Products", "rows": top})
        if top:
            winner = top[0]
            answer = (
                f"Your top selling product for {period} was {winner['Product'] or winner['SKU']} "
                f"with {winner['Sold Units']} units sold and ${winner['Revenue']:,.2f} in sales."
            )
        else:
            answer = f"I did not find Amazon order items for {period}."
    elif operation == "sales_summary":
        tables.append({"title": "Sales by Product", "rows": order_summary})
        answer = f"For {period}, I found {sold_units} units sold across {len(order_summary)} products, totaling ${sales_revenue:,.2f}."
    elif operation == "inventory_status":
        status = _status_rows(inventory, terms, question, detail_limit)
        tables.append({"title": "Inventory Status", "rows": status})
        out_count = sum(1 for row in matched_inventory if (row.get("fulfillable", 0) or 0) <= 0)
        low_count = sum(1 for row in matched_inventory if 0 < (row.get("fulfillable", 0) or 0) <= 5)
        answer = f"Current FBA inventory has {out_count} out-of-stock SKUs and {low_count} low-stock SKUs for the matched products."
    elif operation == "shipment_summary":
        tables.append({"title": "Inbound Shipments", "rows": shipment_summary})
        answer = f"For {period}, I found {shipped_units} units in matching inbound shipment plans across {len(shipment_summary)} SKU rows."
    elif operation == "replenishment_candidates":
        days = max((end - start).days, 1)
        repl = _replenishment_rows(inventory, orders, terms, days, limit)
        tables.append({"title": "Replenishment Candidates", "rows": repl})
        if repl:
            answer = f"I found {len(repl)} restock candidates based on recent sales and current FBA inventory. The highest-risk SKU is {repl[0]['SKU']}."
        else:
            answer = "I did not find urgent restock candidates from the current inventory and recent sales window."
    else:
        tables.extend(
            [
                {"title": "Matched Sales", "rows": order_summary},
                {"title": "Matched Shipments", "rows": shipment_summary},
                {"title": "Matched Current Inventory", "rows": inventory_summary},
            ]
        )
        answer = (
            f"For {', '.join(terms) or 'all matching products'} from {period}, "
            f"I found {shipped_units} units shipped to Amazon, {sold_units} units sold, "
            f"${sales_revenue:,.2f} in sales, {current_units} fulfillable units, and {inbound_units} inbound units."
        )

    return {
        "question": question,
        "plan": plan,
        "date_start": str(start),
        "date_end": str(end - timedelta(days=1)),
        "answer": answer,
        "metrics": metrics,
        "tables": [table for table in tables if table["rows"]],
        "shipments": shipment_summary,
        "orders": order_summary,
        "inventory": inventory_summary,
    }
