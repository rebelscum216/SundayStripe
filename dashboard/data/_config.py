"""
Credential resolution: st.secrets → os.environ → .env file.
Import cfg() in any data loader instead of reading .env directly.
"""
import os
from pathlib import Path

_ENV_FILE = Path(__file__).parent.parent.parent / ".env"
_env_cache: dict | None = None


def _load_dotenv() -> dict:
    global _env_cache
    if _env_cache is not None:
        return _env_cache
    _env_cache = {}
    if _ENV_FILE.exists():
        for line in _ENV_FILE.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                _env_cache[k.strip()] = v.strip().strip('"').strip("'")
    return _env_cache


def cfg(key: str, default=None):
    try:
        import streamlit as st
        if key in st.secrets:
            return st.secrets[key]
    except Exception:
        pass
    val = os.environ.get(key)
    if val is not None:
        return val
    return _load_dotenv().get(key, default)
