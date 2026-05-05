"""Rohlík /zachran-a-usetri scraper (extraction-only).

Subcommands:
  init   one-time: open a real browser, set delivery address (optionally log in),
         persist session to storage_state.json so the right warehouse is used.
  dump   headless: open the page with the saved session, autoscroll, parse every
         "last-minute" product from __NEXT_DATA__, print as JSON to stdout.

Matching, dedup and email are handled by the Supabase Edge Function. This module
is the production scraper invoked by .github/workflows/daily-scrape.yml.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
URL = "https://www.rohlik.cz/zachran-a-usetri"
STATE_FILE = ROOT / "storage_state.json"


def parse_next_data(html: str) -> dict:
    m = re.search(
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL
    )
    if not m:
        raise RuntimeError("__NEXT_DATA__ not found in HTML")
    return json.loads(m.group(1))


def extract_products(html: str) -> list[dict]:
    """Walk the dehydrated React-Query state in __NEXT_DATA__ and pull every
    last-minute product card. Returns a list of normalised dicts."""
    data = parse_next_data(html)
    products: dict[int, dict] = {}

    def walk(node):
        if isinstance(node, dict):
            if (
                "productId" in node
                and "name" in node
                and isinstance(node.get("name"), str)
            ):
                pid = node["productId"]
                if pid not in products:
                    prices = node.get("prices") or {}
                    badges = node.get("badges") or []
                    badge_texts = [
                        b.get("text") for b in badges
                        if isinstance(b, dict) and b.get("text")
                    ]
                    products[pid] = {
                        "id": pid,
                        "name": node["name"],
                        "slug": node.get("slug"),
                        "brand": node.get("brand"),
                        "unit": node.get("unit"),
                        "amount": node.get("textualAmount"),
                        "price": prices.get("salePrice"),
                        "currency": prices.get("currency") or "CZK",
                        "price_before": prices.get("originalPrice"),
                        "unit_price": prices.get("unitPrice"),
                        "sale_text": prices.get("saleText"),
                        "sale_until": prices.get("saleValidTill"),
                        "badges": badge_texts,
                        "url": f"https://www.rohlik.cz/{pid}-{node.get('slug')}"
                               if node.get("slug") else None,
                        "image": (node.get("image") or {}).get("path"),
                    }
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(data)
    return list(products.values())


def cmd_init(args) -> int:
    from playwright.sync_api import sync_playwright

    print("Opening Chromium. Set your delivery address (and log in if desired),")
    print("then press Enter in this terminal to save the session.")
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=False)
        ctx = browser.new_context(locale="cs-CZ")
        page = ctx.new_page()
        page.goto("https://www.rohlik.cz/", wait_until="domcontentloaded")
        try:
            input("Press Enter when address is set... ")
        except EOFError:
            pass
        ctx.storage_state(path=str(STATE_FILE))
        browser.close()
    print(f"Saved session to {STATE_FILE}")
    return 0


def fetch_html(state_path: Path, scroll_rounds: int, headless: bool) -> str:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        kwargs = {"locale": "cs-CZ"}
        if state_path.exists():
            kwargs["storage_state"] = str(state_path)
        ctx = browser.new_context(**kwargs)
        page = ctx.new_page()
        page.goto(URL, wait_until="networkidle", timeout=60_000)
        last_count, stable = -1, 0
        for _ in range(scroll_rounds):
            page.mouse.wheel(0, 4000)
            page.wait_for_timeout(700)
            count = page.evaluate(
                "document.querySelectorAll('[data-test=\"productCard\"], "
                "[data-gtm-item-type], [data-product-id]').length"
            )
            if count == last_count:
                stable += 1
                if stable >= 3:
                    break
            else:
                stable = 0
                last_count = count
        html = page.content()
        browser.close()
    return html


def cmd_dump(args) -> int:
    if args.from_file:
        html = Path(args.from_file).read_text(encoding="utf-8")
    else:
        html = fetch_html(STATE_FILE, scroll_rounds=args.scroll_rounds,
                          headless=not args.headed)
    products = extract_products(html)
    json.dump(products, sys.stdout, ensure_ascii=False, indent=2)
    print()
    return 0


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(description=__doc__)
    sub = p.add_subparsers(dest="cmd", required=True)

    sub.add_parser("init", help="open browser, save session/address").set_defaults(
        func=cmd_init
    )

    d = sub.add_parser("dump", help="scrape and emit products as JSON")
    d.add_argument("--from-file", help="parse a saved HTML file instead of fetching")
    d.add_argument("--headed", action="store_true",
                   help="show browser window (debug)")
    d.add_argument("--scroll-rounds", type=int, default=40)
    d.set_defaults(func=cmd_dump)

    args = p.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
