# Rohlík hlídač slev

A wife-friendly web app that watches your Rohlík wishlist and emails when any
item drops in price by more than your chosen threshold. Works for both regular
promotions and the **Zachraň a ušetři** (last-minute / expiring) section.
Hosted on Vercel + Supabase.

## Architecture (one-liner)

`Vercel (Next.js wishlist UI)` ⇄ `Supabase (Postgres + Edge Function + pg_cron)`
+ `Resend (email)`. **No GitHub Actions, no Playwright, no scraper.**

The daily check runs as a Supabase Edge Function: at the configured Prague hour
each day, it fetches each wishlist item's product page with `?lm=1` (so the
last-minute price surfaces if applicable), computes the discount %, and sends
one Resend digest email for everything above each item's threshold. State is
deduped per `(rohlik_product_id, alert_date)` and cached in
`wishlist_items.last_*` columns so the UI can show today's status.

## Documentation

- [`docs/DEPLOY_NO_TERMINAL.md`](docs/DEPLOY_NO_TERMINAL.md) — **click-by-click deployment, no CLI**
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system diagram, data flow, schema reference
- [`docs/UZIVATEL.md`](docs/UZIVATEL.md) — Czech end-user guide for the wife

## Repo layout

```
web/                                       Next.js App Router (deploy this on Vercel)
  middleware.ts                            HTTP basic auth
  app/page.tsx                             wishlist UI
  app/settings/                            email + alert hour + default threshold
  app/api/preview                          URL → name + image
  app/api/wishlist                         CRUD
  app/api/refresh                          on-demand re-check (no email)
  app/api/settings                         update settings row
  lib/rohlik/                              URL parser + product-page parser
supabase/
  migrations/20260505_001_init.sql         tables
  migrations/20260505_002_pg_cron.sql      hourly cron tick
  migrations/20260505_003_simplify.sql     v2: drops scrape tables, adds status columns
  functions/dispatch-alerts/index.ts       per-product checker + Resend digest
  functions/_shared/rohlik.ts              shared parser
  functions/_shared/email.ts               HTML email template
.github/workflows/deploy-function.yml      one-click Edge Function deploy
```

## How it works

- **Add to wishlist.** `/api/preview` parses the product ID from the URL,
  fetches the product page anonymously, extracts name + image (OG tags +
  `__NEXT_DATA__`).
- **Daily check.** pg_cron fires `dispatch-alerts` at `*:05` of every hour.
  The function returns immediately unless the current Prague hour matches
  `settings.alert_hour`. When it matches, it loads every active wishlist item,
  fetches each product's `?lm=1` URL (with the `WAREHOUSE_COOKIE_HEADER` for
  warehouse-specific pricing), parses `prices.salePrice` and `prices.originalPrice`,
  computes discount %, and sends one Resend digest for everything above each
  item's threshold. The same call updates `wishlist_items.last_*` so the UI
  reflects today's state, and inserts `alert_log` rows so duplicate emails are
  impossible.
- **On-demand refresh.** The wishlist page has an "Aktualizovat" button that
  invokes the function in `?refresh=1` mode — same per-product check, but no
  email is sent.

## Maintenance

- **Warehouse session expiry.** Cookies in `WAREHOUSE_COOKIE_HEADER` last
  weeks but eventually rotate. If the offers stop matching what you see on
  rohlik.cz, re-export cookies via the Cookie-Editor browser extension and
  paste a fresh value into the Supabase Edge Function secret.
- **HTML drift.** `supabase/functions/_shared/rohlik.ts` walks the
  `__NEXT_DATA__` blob looking for the node with the matching `productId` —
  resilient to most key renames. If parsing breaks, the
  `wishlist_items.last_check_error` column will tell you why.

## Notes

- `robots.txt` permits the URLs we touch. The function fetches each wishlist
  product once a day in batches of 8 — well within polite scraping bounds.
- Auth is HTTP basic with a single shared `APP_USERNAME` / `APP_PASSWORD`
  pair. There is no Supabase Auth or admin UI.
