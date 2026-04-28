#!/usr/bin/env python3
"""
Read-only Google Merchant API smoke test.

Verifies that the service account can access Merchant Center, then lists a few
processed products when GOOGLE_MERCHANT_ID is configured in .env.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard.data import merchant


def _short_account(account: dict) -> str:
    name = account.get("name", "")
    account_id = account.get("accountId", "")
    account_name = account.get("accountName", "")
    label = account_name or "(unnamed)"
    return f"{label} | id={account_id} | resource={name}"


def main():
    print("Checking Google Merchant API access...")
    accounts = merchant.list_accounts()

    if not accounts:
        print("Connected, but no Merchant Center accounts were returned.")
        print("Confirm the service account is added to Merchant Center with Admin access.")
        return

    print(f"Connected. Accessible Merchant Center accounts: {len(accounts)}")
    for account in accounts:
        print(f"  - {_short_account(account)}")

    account_id = merchant.get_configured_account_id()
    if not account_id:
        print("\nNext: add GOOGLE_MERCHANT_ID to .env, then rerun this script.")
        print("Use the accountId shown above, for example:")
        print("GOOGLE_MERCHANT_ID=your-merchant-id")
        return

    print(f"\nListing up to 5 processed products for account {account_id}...")
    products = merchant.list_products(account_id=account_id, page_size=5)
    if not products:
        print("No products returned. That can be OK if the feed has not synced yet.")
        return

    for product in products:
        attrs = product.get("productAttributes", {})
        status = product.get("productStatus", {})
        destinations = status.get("destinationStatuses", [])
        approved = [
            d.get("reportingContext", "")
            for d in destinations
            if d.get("approvedCountries")
        ]
        name = product.get("name", "")
        title = attrs.get("title") or "(untitled)"
        availability = attrs.get("availability", "")
        price = attrs.get("price", {})
        amount = price.get("amountMicros")
        currency = price.get("currencyCode", "")
        price_text = ""
        if amount:
            price_text = f" | {int(amount) / 1_000_000:.2f} {currency}"
        print(
            f"  - {title} | offer={product.get('offerId', '')} "
            f"| {availability}{price_text} | approved={', '.join(approved) or 'none'} | {name}"
        )


if __name__ == "__main__":
    main()
