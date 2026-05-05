"""Push the JSON output of rohlik_alert.py dump into Supabase.

Workflow:
  1. open a scrape_runs row
  2. insert today's last_minute_offers in bulk (computing discount_pct)
  3. close the scrape_runs row
  4. POST the dispatch-alerts Edge Function (so the email goes out within
     seconds of the scrape, no need to wait for pg_cron)

Env required:
  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CRON_SECRET
"""

from __future__ import annotations

import json
import os
import sys
import traceback
from datetime import datetime, timezone

import requests

DEFAULT_INPUT = "today.json"


def _round_pct(sale, original) -> int | None:
    if not sale or not original or original <= 0:
        return None
    return max(0, min(99, round((1 - float(sale) / float(original)) * 100)))


def main(path: str = DEFAULT_INPUT) -> int:
    url = os.environ["SUPABASE_URL"].rstrip("/")
    key = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
    cron_secret = os.environ.get("CRON_SECRET", "")
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "return=representation",
    }

    products = json.loads(open(path, encoding="utf-8").read())

    r = requests.post(
        f"{url}/rest/v1/scrape_runs",
        headers=headers,
        json=[{"started_at": datetime.now(timezone.utc).isoformat()}],
        timeout=15,
    )
    r.raise_for_status()
    run_id = r.json()[0]["id"]
    print(f"opened scrape_runs id={run_id}")

    try:
        rows = []
        for p in products:
            rows.append({
                "scrape_run_id": run_id,
                "rohlik_product_id": p["id"],
                "name": p["name"],
                "slug": p.get("slug"),
                "image_url": p.get("image"),
                "url": p.get("url"),
                "sale_price": p.get("price"),
                "original_price": p.get("price_before"),
                "currency": p.get("currency") or "CZK",
                "discount_pct": _round_pct(p.get("price"), p.get("price_before")),
                "sale_text": p.get("sale_text"),
                "sale_valid_till": p.get("sale_until"),
                "badges": p.get("badges") or [],
                "raw": p,
            })
        if rows:
            # bulk insert in chunks of 200
            for i in range(0, len(rows), 200):
                chunk = rows[i:i + 200]
                rr = requests.post(
                    f"{url}/rest/v1/last_minute_offers",
                    headers=headers,
                    json=chunk,
                    timeout=30,
                )
                rr.raise_for_status()
        # close run
        r = requests.patch(
            f"{url}/rest/v1/scrape_runs",
            params={"id": f"eq.{run_id}"},
            headers=headers,
            json={
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "ok": True,
                "product_count": len(rows),
            },
            timeout=15,
        )
        r.raise_for_status()
        print(f"closed scrape_runs id={run_id} count={len(rows)}")
    except Exception as e:
        traceback.print_exc()
        requests.patch(
            f"{url}/rest/v1/scrape_runs",
            params={"id": f"eq.{run_id}"},
            headers=headers,
            json={
                "finished_at": datetime.now(timezone.utc).isoformat(),
                "ok": False,
                "error": str(e)[:1000],
            },
            timeout=15,
        )
        return 1

    if cron_secret:
        try:
            r = requests.post(
                f"{url}/functions/v1/dispatch-alerts",
                headers={"Authorization": f"Bearer {cron_secret}"},
                json={"trigger": "scrape", "run_id": run_id},
                timeout=30,
            )
            print(f"dispatch-alerts -> {r.status_code} {r.text[:200]}")
        except Exception as e:
            print(f"dispatch-alerts trigger failed: {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_INPUT))
