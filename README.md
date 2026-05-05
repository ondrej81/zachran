# Rohlík hlídač slev

A wife-friendly web app that watches https://www.rohlik.cz/zachran-a-usetri
(last-minute discounts) and emails when any item from your wishlist is on sale
today above your discount threshold. Hosted on Vercel + Supabase, scraped daily
by a free GitHub Actions runner.

## Architecture (one-liner)

`Vercel (Next.js wishlist UI)` ⇄ `Supabase (Postgres + Storage + Edge Function)`
+ `GitHub Actions cron (Playwright scrape)` + `Resend (email)`.

See [the full plan](/root/.claude/plans/let-s-do-it-more-merry-fairy.md) — or
the section **Architecture** below.

## Documentation

- [`docs/DEPLOY_NO_TERMINAL.md`](docs/DEPLOY_NO_TERMINAL.md) — **click-by-click deployment, no CLI required**
- [`docs/SETUP.md`](docs/SETUP.md) — full deployment runbook for terminal users
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system diagram, data flows, schema reference
- [`docs/UZIVATEL.md`](docs/UZIVATEL.md) — Czech end-user guide for the wife
- [`scraper/README.md`](scraper/README.md) — how to refresh the warehouse session

For a 100% browser-based setup, follow `DEPLOY_NO_TERMINAL.md` — the Edge
Function deploys via a one-click GitHub Actions workflow
(`.github/workflows/deploy-function.yml`) and the warehouse session is captured
through the Cookie-Editor browser extension instead of Playwright.

## Repo layout

```
web/        Next.js App Router (deployed to Vercel)
supabase/   migrations + dispatch-alerts edge function
scraper/    Python + Playwright scraper (run by GitHub Actions)
.github/    daily-scrape.yml workflow
```

## First-time setup

### 1. Supabase project

1. Create a project at https://supabase.com.
2. Push the migrations:
   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <ref>
   pnpm dlx supabase db push
   ```
3. Set two database settings used by `pg_cron`:
   ```sql
   alter database postgres set "app.functions_url" = 'https://<ref>.functions.supabase.co';
   alter database postgres set "app.cron_secret"   = '<your CRON_SECRET>';
   ```
4. Deploy the Edge Function:
   ```bash
   pnpm dlx supabase functions deploy dispatch-alerts --no-verify-jwt
   pnpm dlx supabase secrets set \
     CRON_SECRET=... \
     RESEND_API_KEY=re_... \
     RESEND_FROM='Rohlík <alerts@yourdomain.cz>' \
     APP_URL='https://your-app.vercel.app'
   ```

### 2. Vercel

1. Import the repo, set the **Root Directory** to `web/`.
2. Add the env vars from `web/.env.example`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_USERNAME` / `APP_PASSWORD` — credentials your wife will use
   - `ADMIN_USERNAME` / `ADMIN_PASSWORD` — separate, husband-only
   - `CRON_SECRET` — same value as in Supabase secrets

### 3. Bootstrap the warehouse session (you, once)

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
python rohlik_alert.py init      # Chromium opens; set your address; press Enter
```

This produces `scraper/storage_state.json`. Open
`https://<your-app>.vercel.app/admin`, log in with `ADMIN_USERNAME/PASSWORD`,
upload the file. The web app uploads it to a private Supabase Storage bucket
and immediately runs a healthcheck. You'll see "Healthcheck: OK".

### 4. GitHub Actions

Add three repository secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`

The workflow `.github/workflows/daily-scrape.yml` runs at 04:05 and 06:05 UTC
(covering 06:05/07:05 Prague summer/winter). The Edge Function only emails at
the user's `alert_hour`, so the two daily fires are deduped naturally.

### 5. First settings

Visit `https://<your-app>.vercel.app/settings`, fill in:

- email for alerts (your wife's address)
- preferred hour (Europe/Prague)
- default discount % for new items

Then visit `/`, paste a Rohlík product URL, confirm the preview, save.

## How it works

- **Add to wishlist.** `/api/preview` takes a Rohlík URL, regexes the product
  ID out of the slug, fetches the page anonymously and parses `__NEXT_DATA__`
  for `name` + `image.path` (with Open Graph tags as fallback). The browser
  shows the preview and lets the wife pick a discount-% threshold before
  saving.
- **Daily scrape.** GitHub Actions downloads the warehouse session from
  Supabase Storage, runs `scraper/rohlik_alert.py dump` (Playwright with
  autoscroll on `/zachran-a-usetri`), and writes the result rows to
  `last_minute_offers`. It then POSTs `dispatch-alerts` to fire the email
  immediately.
- **Email.** `dispatch-alerts` joins `wishlist_items` against
  `last_minute_offers` for today's Prague date, filters by per-item
  `min_discount_pct`, sends a single Resend digest, and inserts one
  `alert_log` row per match. The PK on `(rohlik_product_id, alert_date)`
  prevents duplicates if pg_cron re-fires later that hour.

## Maintenance

- **Session expiration.** Rohlík cookies live for weeks. The healthcheck on
  `/admin` runs on every upload and on demand. If `healthcheck_ok=false`,
  re-run `python rohlik_alert.py init` and re-upload.
- **HTML drift.** The extractor in `scraper/rohlik_alert.py` walks the JSON
  blob looking for `{productId, name}` nodes — it's resilient to most key
  renames. If product counts plummet (`scrape_runs.product_count`), look at
  `last_minute_offers.raw` for the new shape.

## Local development

```bash
# Supabase
pnpm dlx supabase start         # local Postgres + Storage on :54321
pnpm dlx supabase db reset      # apply migrations

# Web
cd web
pnpm install
pnpm dev                        # http://localhost:3000

# Scraper (offline parse)
cd scraper
python rohlik_alert.py dump --from-file /tmp/rohlik.html
```

## Files of interest

| Path | Purpose |
| --- | --- |
| `web/middleware.ts` | HTTP basic-auth gate |
| `web/app/page.tsx` | Wishlist UI |
| `web/app/api/preview/route.ts` | URL → name + image |
| `web/app/api/wishlist/route.ts` | CRUD |
| `web/app/api/admin/session/route.ts` | upload `storage_state.json` |
| `supabase/migrations/20260505_001_init.sql` | schema |
| `supabase/functions/dispatch-alerts/index.ts` | match + email |
| `scraper/rohlik_alert.py` | Playwright scraper |
| `.github/workflows/daily-scrape.yml` | daily cron |

## Notes

- `robots.txt` permits `/zachran-a-usetri`; we run once a day. Don't hammer.
- `storage_state.json` carries login cookies — `.gitignore` keeps it out of
  the repo, and Supabase Storage holds it in a private bucket.
