"""Daily scraper + alerter for rohlik.cz/zachran-a-usetri.

Two subcommands:
  init   one-time: open a real browser, set delivery address (optionally log in),
         persist session to storage_state.json so the right warehouse is used.
  run    headless: open the page with the saved session, autoscroll, extract every
         "last-minute" product from __NEXT_DATA__, match against favorites.txt,
         print + write a Markdown report, and optionally send notifications.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import smtplib
import sys
import time
import unicodedata
import urllib.request
from email.message import EmailMessage
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parent
URL = "https://www.rohlik.cz/zachran-a-usetri"
STATE_FILE = ROOT / "storage_state.json"
FAVORITES_FILE = ROOT / "favorites.txt"
REPORTS_DIR = ROOT / "reports"
SEEN_FILE = ROOT / ".seen.json"


# ---------- product extraction ----------

def parse_next_data(html: str) -> dict:
    m = re.search(
        r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', html, re.DOTALL
    )
    if not m:
        raise RuntimeError("__NEXT_DATA__ not found in HTML")
    return json.loads(m.group(1))


def extract_products(html: str) -> list[dict]:
    """Pull every last-minute product card out of the dehydrated React-Query
    state embedded in __NEXT_DATA__. Returns a list of normalised dicts."""
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
                    badge_texts = [b.get("text") for b in badges if isinstance(b, dict) and b.get("text")]
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


# ---------- favorites matching ----------

def _norm(s: str) -> str:
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    return s.lower().strip()


def load_favorites(path: Path) -> list[str]:
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            out.append(line)
    return out


def match_products(products: list[dict], favorites: list[str]) -> list[tuple[dict, list[str]]]:
    """Return (product, [matched_favorite_terms]) pairs. A favorite matches if
    every whitespace-separated token of it appears (substring, accent-insensitive)
    in the product name."""
    matches = []
    for p in products:
        hay = _norm(p["name"])
        hits = []
        for fav in favorites:
            tokens = [_norm(t) for t in fav.split() if t]
            if tokens and all(tok in hay for tok in tokens):
                hits.append(fav)
        if hits:
            matches.append((p, hits))
    return matches


# ---------- scraping ----------

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
        # autoscroll until card count stops growing
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


def fetch_html_requests(state_path: Path) -> str:
    """Fallback that uses urllib + cookies from storage_state.json. Only returns
    the SSR first page (~14 cards), but works without Playwright at runtime."""
    cookies = ""
    if state_path.exists():
        st = json.loads(state_path.read_text())
        cookies = "; ".join(f"{c['name']}={c['value']}" for c in st.get("cookies", []))
    req = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) "
                          "Chrome/120.0 Safari/537.36",
            "Accept-Language": "cs,en;q=0.9",
            "Cookie": cookies,
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8")


# ---------- notifications ----------

def render_report(matches: list[tuple[dict, list[str]]], all_count: int) -> str:
    today = dt.date.today().isoformat()
    lines = [f"# Rohlík Zachraň a ušetři — {today}", ""]
    lines.append(f"Scanned **{all_count}** discounted products. "
                 f"Matched **{len(matches)}** favorite(s).")
    lines.append("")
    if not matches:
        lines.append("_No favorites on sale today._")
        return "\n".join(lines)
    for p, hits in matches:
        price = f"{p['price']} {p['currency']}" if p.get("price") else "?"
        before = f" (was {p['price_before']} {p['currency']})" if p.get("price_before") else ""
        sale = f" — {p['sale_text']}" if p.get("sale_text") else ""
        until = f", until {p['sale_until']}" if p.get("sale_until") else ""
        url = p.get("url") or ""
        amount = f" · {p['amount']}" if p.get("amount") else ""
        badges = f" [{'; '.join(p['badges'])}]" if p.get("badges") else ""
        lines.append(f"- **{p['name']}**{amount} — {price}{before}{sale}{until}{badges}")
        lines.append(f"  matched: {', '.join(hits)}")
        if url:
            lines.append(f"  {url}")
    return "\n".join(lines)


def send_email(report_md: str, subject: str) -> None:
    host = os.environ.get("SMTP_HOST")
    if not host:
        return
    user = os.environ["SMTP_USER"]
    pwd = os.environ["SMTP_PASS"]
    to = os.environ.get("ALERT_TO", user)
    port = int(os.environ.get("SMTP_PORT", "587"))
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = user
    msg["To"] = to
    msg.set_content(report_md)
    with smtplib.SMTP(host, port) as s:
        s.starttls()
        s.login(user, pwd)
        s.send_message(msg)


def send_telegram(report_md: str) -> None:
    token = os.environ.get("TELEGRAM_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID")
    if not (token and chat):
        return
    body = report_md if len(report_md) < 3500 else report_md[:3500] + "\n…"
    data = json.dumps({"chat_id": chat, "text": body, "parse_mode": "Markdown"}).encode()
    req = urllib.request.Request(
        f"https://api.telegram.org/bot{token}/sendMessage",
        data=data,
        headers={"Content-Type": "application/json"},
    )
    urllib.request.urlopen(req, timeout=15).read()


# ---------- run ----------

def cmd_run(args) -> int:
    favorites = load_favorites(FAVORITES_FILE)
    if not favorites:
        print(f"No favorites configured. Add product name fragments to {FAVORITES_FILE}",
              file=sys.stderr)
        return 2

    if args.no_browser:
        html = fetch_html_requests(STATE_FILE)
    else:
        html = fetch_html(STATE_FILE, scroll_rounds=args.scroll_rounds,
                          headless=not args.headed)

    products = extract_products(html)
    matches = match_products(products, favorites)
    report = render_report(matches, len(products))
    print(report)

    REPORTS_DIR.mkdir(exist_ok=True)
    date = dt.date.today().isoformat()
    (REPORTS_DIR / f"{date}.md").write_text(report, encoding="utf-8")

    # only notify on new matches we haven't reported before today
    seen = json.loads(SEEN_FILE.read_text()) if SEEN_FILE.exists() else {}
    today_seen = set(seen.get(date, []))
    new_matches = [m for m in matches if m[0]["id"] not in today_seen]
    if new_matches and not args.dry_run:
        new_report = render_report(new_matches, len(products))
        subject = f"Rohlík: {len(new_matches)} favorite(s) on sale"
        try:
            send_email(new_report, subject)
        except Exception as e:
            print(f"email failed: {e}", file=sys.stderr)
        try:
            send_telegram(new_report)
        except Exception as e:
            print(f"telegram failed: {e}", file=sys.stderr)
        seen[date] = list(today_seen | {m[0]["id"] for m in matches})
        # keep last 14 days
        cutoff = (dt.date.today() - dt.timedelta(days=14)).isoformat()
        seen = {k: v for k, v in seen.items() if k >= cutoff}
        SEEN_FILE.write_text(json.dumps(seen))

    return 0 if matches else 1


def cmd_dump(args) -> int:
    """Print the raw extracted product list as JSON; useful for debugging."""
    if args.from_file:
        html = Path(args.from_file).read_text(encoding="utf-8")
    elif args.no_browser:
        html = fetch_html_requests(STATE_FILE)
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

    r = sub.add_parser("run", help="scrape and alert")
    r.add_argument("--headed", action="store_true",
                   help="show browser window (debug)")
    r.add_argument("--no-browser", action="store_true",
                   help="skip Playwright, fetch SSR HTML only (first page)")
    r.add_argument("--scroll-rounds", type=int, default=40)
    r.add_argument("--dry-run", action="store_true",
                   help="print the report; don't send notifications")
    r.set_defaults(func=cmd_run)

    d = sub.add_parser("dump", help="dump extracted products as JSON")
    d.add_argument("--from-file", help="parse a saved HTML file instead of fetching")
    d.add_argument("--headed", action="store_true")
    d.add_argument("--no-browser", action="store_true")
    d.add_argument("--scroll-rounds", type=int, default=40)
    d.set_defaults(func=cmd_dump)

    args = p.parse_args(list(argv) if argv is not None else None)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
