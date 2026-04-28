#!/usr/bin/env python3
"""Print the active Shopify Admin API scopes used by the dashboard."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "dashboard"))

from data.shopify import SHOP, get_access_scopes


def main():
    scopes = get_access_scopes()
    print(f"Shop: {SHOP}")
    print("Scopes:")
    for scope in sorted(scopes):
        print(f"  - {scope}")
    if "read_orders" not in scopes:
        print("\nMissing: read_orders")
        print("Revenue metrics need a Shopify Admin token that includes read_orders.")


if __name__ == "__main__":
    main()
