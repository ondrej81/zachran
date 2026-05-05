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
        │   ├ /, /settings, /admin                          │
        │   ├ /api/preview         URL → name + image      │
        │   ├ /api/wishlist        CRUD                    │
        │   ├ /api/settings        update singleton row    │
        │   ├ /api/admin/session   upload storage_state    │
        │   └ /api/cron-webhook    GH Actions → Edge Fn    │
        └────────┬───────────────────────────┬─────────────┘
                 │ supabase-js (service role) │ https
                 ▼                            ▼
        ┌────────────────────────┐  ┌──────────────────────┐
        │ Supabase               │  │ rohlik.cz            │
        │ • Postgres             │  │ /<id>-<slug> (preview)│
        │ • Storage (warehouse/) │  │ /zachran-a-usetri    │
        │ • Edge Function:       │  └──────────────────────┘
        │   dispatch-alerts      │            ▲
        │ • pg_cron */15 min     │            │
        └─────────┬──────────────┘            │
                  │ service-role REST         │
                  ▼                           │
        ┌────────────────────────┐            │
        │ GitHub Actions cron    │────────────┘
        │ (Playwright + Python)  │
        └────────────────────────┘
                  │ Resend API
                  ▼
        ┌────────────────────────┐
        │ Resend (email)         │
        └────────────────────────┘
```

## Data flows

### Add to wishlist

```
Browser → POST /api/preview { url }
  Vercel: extractProductId() → fetch product page → parseProductPage()
  Returns { productId, name, imageUrl, slug, sourceUrl }

Browser → POST /api/wishlist { productId, name, imageUrl, sourceUrl, minDiscountPct }
  Vercel: supabase.from("wishlist_items").upsert(... on conflict rohlik_product_id)
```

The preview never touches the warehouse session — OG tags + the product's own
`__NEXT_DATA__` give us everything (name, image, brand) without needing a
delivery address.

### Daily scrape

```
06:05 UTC and 04:05 UTC: GitHub Actions
  fetch_session.py        ── downloads storage_state.json from Storage
  rohlik_alert.py dump    ── Playwright autoscroll, parse __NEXT_DATA__, JSON
  push_to_supabase.py     ── insert scrape_runs + last_minute_offers
                              POST dispatch-alerts (Bearer CRON_SECRET)
```

`discount_pct` is computed at insert time as
`round((1 − salePrice / originalPrice) × 100)`, clamped to `[0, 99]`.

### Email dispatch

```
Triggered by:
  • the scrape job (immediate, within seconds of new offers)
  • pg_cron */15 * * * *  (catch-up)

dispatch-alerts:
  pragueNow → if hour != settings.alert_hour and not force → skip
  select * from todays_matches    ── view that filters on Prague-today,
                                     min_discount_pct, NOT IN alert_log
  if no matches → return { sent: 0 }
  resend.send(html = renderEmail(matches))
  upsert alert_log on (rohlik_product_id, alert_date)
```

The `alert_log` PK guarantees idempotency. If the GH Action fires twice
(daily-scrape has two cron times for DST coverage) and pg_cron retries every
15 min, only one email goes out per product per day.

## Database schema

```
settings              one row, id = 1
  alert_email                 text         email recipient
  alert_hour                  int2 (0-23)  Europe/Prague hour
  default_min_discount_pct    int2 (0-99)  default for new wishlist items
  warehouse_label             text         display only

wishlist_items
  id                  uuid PK
  rohlik_product_id   bigint UNIQUE
  name, image_url, source_url
  min_discount_pct    int2 (0-99)          per-item threshold
  is_active           bool

scrape_runs
  id                  uuid PK
  started_at, finished_at
  ok                  bool
  product_count       int
  error               text

last_minute_offers   PK (scrape_run_id, rohlik_product_id)
  scrape_run_id       FK -> scrape_runs
  rohlik_product_id, name, slug, image_url, url
  sale_price, original_price, currency
  discount_pct        int2                 computed at insert
  sale_text, sale_valid_till
  badges              text[]
  raw                 jsonb                full normalised dict

alert_log            PK (rohlik_product_id, alert_date)
  scrape_run_id       FK -> scrape_runs
  matched_discount_pct, sale_price
  sent_at, resend_message_id

warehouse_sessions
  id                  uuid PK
  storage_path        text                 object key in storage.warehouse
  is_current          bool                 partial unique on (true)
  healthcheck_ok      bool
  healthcheck_at      timestamptz
```

### `todays_matches` view

```sql
create or replace view public.todays_matches as
select w.id as wishlist_item_id, w.rohlik_product_id, w.name as wishlist_name,
       w.min_discount_pct, o.name, o.image_url, o.url, o.sale_price,
       o.original_price, o.discount_pct, o.sale_text, o.sale_valid_till,
       o.scrape_run_id, r.started_at
from public.wishlist_items w
join public.last_minute_offers o on o.rohlik_product_id = w.rohlik_product_id
join public.scrape_runs r on r.id = o.scrape_run_id
where w.is_active and r.ok
  and (r.started_at at time zone 'Europe/Prague')::date
      = (now() at time zone 'Europe/Prague')::date
  and o.discount_pct >= w.min_discount_pct
  and not exists (
    select 1 from public.alert_log a
    where a.rohlik_product_id = w.rohlik_product_id
      and a.alert_date = (now() at time zone 'Europe/Prague')::date
  );
```

The view is the single source of truth for "what should the email contain
right now". The wishlist UI uses it for the "Dnes sleva …" badge; the Edge
Function uses it for the email digest.

## Auth model

| Resource | Auth |
| --- | --- |
| `/`, `/settings` | basic auth `APP_USERNAME` / `APP_PASSWORD` |
| `/admin/*` | basic auth `ADMIN_USERNAME` / `ADMIN_PASSWORD` |
| `/api/cron-webhook` | Bearer `CRON_SECRET` (basic-auth bypassed via middleware matcher) |
| Edge Function `dispatch-alerts` | Bearer `CRON_SECRET` |
| All Supabase writes | service-role key (server-only) |

There is no Supabase Auth. Single-tenant by design.

## Why this shape

- **GitHub Actions + Playwright** instead of Vercel/Edge Function browser:
  10 s/150 s/300 s function ceilings can't reliably fit autoscrolling 100+
  product cards. GH Actions has no time pressure and is free.
- **Per-product threshold** (not global): the wife may want "alert me if cream
  cheese is even 5 % off" but "alert me only if salmon is ≥ 30 % off". Per-row
  `min_discount_pct` makes each item independent.
- **Alert window = Prague-day, dedup on `(product, date)`**: the user wanted
  "once per day while on sale". This precisely matches the requirement and
  survives multiple scrape attempts in the same day.
- **Singleton settings row** (no auth): the wife is the only user; an
  `id = 1` config row is simpler than a per-user table.

## Files

| Path | Role |
| --- | --- |
| `web/middleware.ts` | basic auth gate |
| `web/app/api/preview/route.ts` | URL → preview |
| `web/app/api/wishlist/route.ts` | CRUD |
| `web/app/api/admin/session/route.ts` | upload + healthcheck |
| `web/lib/rohlik/extractProductId.ts` | URL parser |
| `web/lib/rohlik/parseProductPage.ts` | TS port of the scraper extractor |
| `supabase/migrations/20260505_001_init.sql` | tables + view + bucket |
| `supabase/migrations/20260505_002_pg_cron.sql` | scheduled trigger |
| `supabase/functions/dispatch-alerts/index.ts` | match + email |
| `supabase/functions/_shared/email.ts` | HTML template |
| `scraper/rohlik_alert.py` | Playwright scrape (extraction kept as-is) |
| `scraper/push_to_supabase.py` | scrape result → DB + dispatch trigger |
| `scraper/fetch_session.py` | Storage → local `storage_state.json` |
| `.github/workflows/daily-scrape.yml` | cron job |
