# Architecture

## Components

```
              ┌─────────────────────────────────────────┐
              │  Browser (wife)                         │
              │  basic auth: APP_USERNAME / APP_PASSWORD│
              └────────────────┬────────────────────────┘
                               │ https
                               ▼
        ┌──────────────────────────────────────────────────┐
        │  Vercel — Next.js App Router (Node runtime)      │
        │   ├ middleware.ts        basic-auth gate         │
        │   ├ /, /settings                                  │
        │   ├ /api/preview         URL → name + image      │
        │   ├ /api/wishlist        CRUD                    │
        │   ├ /api/settings        update singleton row    │
        │   └ /api/refresh         on-demand re-check      │
        └────────┬───────────────────────────┬─────────────┘
                 │ supabase-js (service role) │ https
                 ▼                            ▼
        ┌────────────────────────────┐  ┌──────────────────┐
        │ Supabase                   │  │ rohlik.cz        │
        │ • Postgres                 │  │ /<id>-<slug>     │
        │ • Edge Function:           │  │   (preview)      │
        │   dispatch-alerts          │  │ /<id>-<slug>?lm=1│
        │ • pg_cron 5 * * * *        │  │   (daily check)  │
        └─────────┬──────────────────┘  └──────────────────┘
                  │ Resend API
                  ▼
        ┌────────────────────────────┐
        │ Resend (email)             │
        └────────────────────────────┘
```

## Data flows

### Add to wishlist

```
Browser → POST /api/preview { url }
  Vercel: extractProductId() → fetch product page anonymously
        → parseProductPage() → { productId, name, imageUrl, slug, sourceUrl }

Browser → POST /api/wishlist { productId, name, imageUrl, sourceUrl, minDiscountPct }
  Vercel: supabase.from("wishlist_items").upsert(... on conflict rohlik_product_id)
```

### Daily check (the morning email)

```
05:05, 06:05, …, 23:05 Prague — pg_cron fires dispatch-alerts.

dispatch-alerts:
  if Prague-hour != settings.alert_hour: return { skipped }

  items = select * from wishlist_items where is_active

  for chunk of 8 in items:
    parallel fetch <source_url>?lm=1 with WAREHOUSE_COOKIE_HEADER
    parseProduct(html, productId) → { salePrice, originalPrice, discountPct, … }

  update wishlist_items.last_* for every item (UI uses this)

  candidates = items where discountPct >= min_discount_pct
  new = candidates not in alert_log for today
  if new.length > 0:
    resend.send( renderEmail(new) )
    upsert alert_log on (rohlik_product_id, alert_date)
```

The `alert_log` PK guarantees idempotency — pg_cron will fire 24 times per
day; only the one tick at `settings.alert_hour` does work, and even if the
function were re-invoked for the same hour, the dedup prevents a second email.

### On-demand refresh

```
Browser → POST /api/refresh
  Vercel proxies to dispatch-alerts?refresh=1
  dispatch-alerts: same per-product check, but skip the email + alert_log
                   write. Updates last_* and returns counts.
```

## Database schema

```
settings              one row, id = 1
  alert_email                 text         email recipient
  alert_hour                  int2 (0-23)  Europe/Prague hour
  default_min_discount_pct    int2 (0-99)  default for new wishlist items
  warehouse_label             text         display only

wishlist_items
  id                       uuid PK
  rohlik_product_id        bigint UNIQUE
  name, image_url, source_url
  min_discount_pct         int2 (0-99)
  is_active                bool
  -- status from the most recent dispatch-alerts run:
  last_check_at            timestamptz
  last_sale_price          numeric(10,2)
  last_original_price      numeric(10,2)
  last_discount_pct        int2
  last_sale_valid_till     timestamptz
  last_check_error         text

alert_log            PK (rohlik_product_id, alert_date)
  matched_discount_pct, sale_price
  sent_at, resend_message_id
```

No `last_minute_offers` snapshot table, no `scrape_runs`, no
`warehouse_sessions`. They were dropped in migration 003.

## Auth model

| Resource | Auth |
| --- | --- |
| `/`, `/settings`, every `/api/*` | basic auth `APP_USERNAME` / `APP_PASSWORD` |
| Edge Function `dispatch-alerts` | Bearer `CRON_SECRET` |
| All Supabase writes | service-role key (server-only) |
| Rohlík fetches | `WAREHOUSE_COOKIE_HEADER` Edge Function secret |

## Why this shape

- **No Playwright, no GitHub Actions cron.** `?lm=1` exposes the last-minute
  price for any product whose discount is hidden from the plain URL, so a
  per-product HTTP fetch is sufficient. ~50 wishlist items resolve in seconds.
- **Per-product threshold** (not global): the wife may want "alert me on any
  promo for this", but "alert me on ≥ 30 % off for that". Each row carries
  its own `min_discount_pct`.
- **Once-per-day-per-product dedup** via `alert_log` PK on
  `(rohlik_product_id, alert_date)`. Combines with the hourly cron to make
  re-fires idempotent.
- **Status cached on `wishlist_items`** so the wishlist UI can show the
  "Dnes sleva …" badge without repeating the fetch on every page load.

## Files

| Path | Role |
| --- | --- |
| `web/middleware.ts` | basic auth gate |
| `web/app/api/preview/route.ts` | URL → preview |
| `web/app/api/wishlist/route.ts` | CRUD |
| `web/app/api/refresh/route.ts` | trigger refresh-only run |
| `web/lib/rohlik/extractProductId.ts` | URL parser |
| `web/lib/rohlik/parseProductPage.ts` | preview parser |
| `supabase/migrations/20260505_001_init.sql` | tables |
| `supabase/migrations/20260505_002_pg_cron.sql` | hourly tick |
| `supabase/migrations/20260505_003_simplify.sql` | drop scrape tables, add status cols |
| `supabase/functions/dispatch-alerts/index.ts` | per-product check + email |
| `supabase/functions/_shared/rohlik.ts` | Deno parser shared with the function |
| `supabase/functions/_shared/email.ts` | HTML email template |
| `.github/workflows/deploy-function.yml` | one-click Edge Function deploy |
