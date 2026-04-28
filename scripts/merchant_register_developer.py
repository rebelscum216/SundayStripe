#!/usr/bin/env python3
"""
One-time Google Merchant API developer registration.

This links the authenticated Google Cloud project to your Merchant Center
account so later Merchant API calls can run.
"""

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dashboard.data import merchant


def _env_value(name: str) -> str:
    if os.environ.get(name):
        return os.environ[name]

    env_file = Path(__file__).resolve().parents[1] / ".env"
    if env_file.exists():
        for line in env_file.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                if key.strip() == name:
                    return value.strip().strip('"').strip("'")
    return ""


def main():
    account_id = _env_value("GOOGLE_MERCHANT_ID")
    developer_email = _env_value("GOOGLE_MERCHANT_DEVELOPER_EMAIL")

    if not account_id or not developer_email:
        print("Set GOOGLE_MERCHANT_ID and GOOGLE_MERCHANT_DEVELOPER_EMAIL, then rerun.")
        print("Example:")
        print("GOOGLE_MERCHANT_ID=your-merchant-id")
        print("GOOGLE_MERCHANT_DEVELOPER_EMAIL=you@example.com")
        raise SystemExit(1)

    print(f"Registering Cloud project for Merchant Center account {account_id}...")
    result = merchant.register_developer(account_id, developer_email)
    print("Registered.")
    print(result)


if __name__ == "__main__":
    main()
