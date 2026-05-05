"""Download the current warehouse storage_state.json from Supabase Storage.

Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env, looks up the
warehouse_sessions row with is_current=true, downloads the corresponding
object from the private "warehouse" bucket, and writes it next to
rohlik_alert.py so the scraper can use it.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import requests

ROOT = Path(__file__).resolve().parent
DEST = ROOT / "storage_state.json"


def main() -> int:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}

    r = requests.get(
        f"{url}/rest/v1/warehouse_sessions",
        params={"select": "storage_path", "is_current": "eq.true", "limit": 1},
        headers=headers,
        timeout=15,
    )
    r.raise_for_status()
    rows = r.json()
    if not rows:
        print("no current warehouse session in DB; upload one via /admin",
              file=sys.stderr)
        return 2
    path = rows[0]["storage_path"]

    r = requests.get(
        f"{url}/storage/v1/object/warehouse/{path}",
        headers=headers,
        timeout=30,
    )
    r.raise_for_status()
    DEST.write_bytes(r.content)
    print(f"wrote {DEST} ({len(r.content)} bytes) from {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
