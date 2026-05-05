# rohlik-alert

Daily scraper + alerter for the **Zachraň a ušetři** (last-minute discount) page on
[rohlik.cz](https://www.rohlik.cz/zachran-a-usetri). Tells you each morning whether
any of your favorite products are on sale today, at the warehouse that serves your
delivery address.

## How it works

The page is a Next.js SSR app. Each rendered HTML response embeds a React-Query
dehydrated state inside `<script id="__NEXT_DATA__">` containing every
`categoryType: "last-minute"` product card (id, name, slug, sale price, original
price, sale text, expiration). The first ~14 items ship with the SSR; the rest
load on scroll. The offer set depends on the warehouse Rohlík picks for your
delivery address — so we persist a real browser session (cookies + localStorage)
and reuse it.

The scraper:

1. opens the page in a headless Chromium that has the saved session,
2. autoscrolls until the card grid stops growing,
3. parses `__NEXT_DATA__`,
4. matches every card name against your `favorites.txt` (accent- and
   case-insensitive, multi-token AND-match),
5. writes a Markdown report and (optionally) emails / sends a Telegram message.

## One-time setup

```bash
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

cp favorites.example.txt favorites.txt
$EDITOR favorites.txt          # one product-name fragment per line

python3 rohlik_alert.py init   # opens Chromium; set delivery address, optionally log in
                               # press Enter in the terminal once you're done
```

`init` writes `storage_state.json` (cookies + localStorage) which the daily run
reuses, so the warehouse / address / login stay set indefinitely. Both files
are git-ignored.

## Daily run

```bash
python3 rohlik_alert.py run
```

Useful flags:

| flag | effect |
| --- | --- |
| `--dry-run` | print the report, skip notifications |
| `--headed` | watch the browser (debug) |
| `--no-browser` | skip Playwright; only the SSR first page (~14 items) |
| `--scroll-rounds N` | cap autoscroll iterations (default 40) |

Output:

- stdout — full Markdown report
- `reports/YYYY-MM-DD.md` — same report saved
- exit code `0` if any favorite matched, `1` otherwise (handy for cron tooling)

## Notifications (optional)

Set any subset of these env vars; missing ones are skipped silently.

```bash
# email (SMTP with STARTTLS)
export SMTP_HOST=smtp.gmail.com SMTP_PORT=587
export SMTP_USER=you@example.com SMTP_PASS=app-password
export ALERT_TO=you@example.com   # defaults to SMTP_USER

# Telegram
export TELEGRAM_BOT_TOKEN=12345:abc
export TELEGRAM_CHAT_ID=987654321
```

The notifier only sends alerts for **new** matches it hasn't reported earlier on
the same day (state in `.seen.json`), so you can run it more than once without
spamming yourself.

## Cron

```cron
30 7 * * *  cd /home/user/zachran && /home/user/zachran/.venv/bin/python rohlik_alert.py run >> reports/cron.log 2>&1
```

Or systemd-timer if you prefer; the script is a normal exit-code-emitting CLI.

## Favorites format

```
# substring, accent- and case-insensitive
# multi-word lines AND every token together
maso veprovy
hovezi nudlicky
prazma
losos
```

`maso veprovy` matches "MASO! Vepřový bok v celku s kůží" but not "MASO! Hovězí…".

## Files

| path | purpose |
| --- | --- |
| `rohlik_alert.py` | the CLI (no other source files) |
| `favorites.txt` | your patterns (git-ignored) |
| `storage_state.json` | saved browser session (git-ignored) |
| `reports/` | per-day Markdown reports (git-ignored) |
| `.seen.json` | dedup state for notifications (git-ignored) |

## Notes

- `robots.txt` permits `/zachran-a-usetri`. Run once a day; don't hammer.
- If Rohlík changes the embedded state shape, fix `extract_products` in
  `rohlik_alert.py`. The logic walks every dict and picks up nodes that have
  both `productId` and `name`, so minor refactors won't break it.
- `storage_state.json` carries auth cookies. Never commit it.
