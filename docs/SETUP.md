# Setup runbook

Step-by-step deployment, top to bottom. Plan ~30 minutes for a fresh setup.

## 0. Prerequisites

- A GitHub repo with this code pushed (you have this already).
- A Supabase account (free tier is enough).
- A Vercel account (free Hobby is enough).
- A Resend account with one verified sending domain (or use the unverified
  `onboarding@resend.dev` while testing).
- Local: Python 3.12, Node 20+, the `supabase` CLI, the `vercel` CLI (optional).

## 1. Generate the shared secrets

You'll paste these into three places (Supabase, Vercel, GitHub Actions) so make
them once and keep them open:

```bash
openssl rand -hex 24    # CRON_SECRET
openssl rand -base64 18 # APP_PASSWORD
openssl rand -base64 18 # ADMIN_PASSWORD
```

| Variable | Used by |
| --- | --- |
| `CRON_SECRET` | Edge Function (auth check), Next.js webhook, GH Actions job, pg_cron |
| `APP_PASSWORD` | basic-auth for the wife's UI |
| `ADMIN_PASSWORD` | basic-auth for `/admin` |

## 2. Supabase

```bash
pnpm dlx supabase login
pnpm dlx supabase projects create rohlik-wishlist --region eu-central-1
pnpm dlx supabase link --project-ref <ref-from-output>
pnpm dlx supabase db push
```

Then in the Supabase SQL editor:

```sql
alter database postgres set "app.functions_url"
  = 'https://<ref>.functions.supabase.co';
alter database postgres set "app.cron_secret" = '<CRON_SECRET>';
```

Deploy the Edge Function:

```bash
pnpm dlx supabase functions deploy dispatch-alerts --no-verify-jwt
pnpm dlx supabase secrets set \
  CRON_SECRET='<CRON_SECRET>' \
  RESEND_API_KEY='re_...' \
  RESEND_FROM='Rohlík <alerts@yourdomain.cz>' \
  APP_URL='https://<your-app>.vercel.app'
```

Grab `Project URL` and `service_role` key from
**Settings → API**. Save them — you'll need both in the next two steps.

## 3. Vercel

In **Project → Settings → General**:
- **Root Directory**: `web`

In **Project → Settings → Environment Variables** (Production scope):

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase) |
| `APP_USERNAME` | `zena` (or whatever) |
| `APP_PASSWORD` | (from step 1) |
| `ADMIN_USERNAME` | `admin` |
| `ADMIN_PASSWORD` | (from step 1) |
| `CRON_SECRET` | (from step 1) |

Deploy. The first request will show a basic-auth prompt — that's the gate.

## 4. GitHub Actions

In the repo **Settings → Secrets and variables → Actions → New
repository secret**, add three:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | (from Supabase) |
| `CRON_SECRET` | (from step 1) |

The workflow runs at 04:05 UTC and 06:05 UTC. Trigger a manual run from the
**Actions** tab once you've completed step 5 (so there's a session to use).

## 5. Bootstrap the warehouse session

The scrape needs cookies bound to your delivery address. Do this on your
laptop, once.

```bash
cd scraper
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium
python rohlik_alert.py init
```

A Chromium window opens. Pick your delivery address (and log in if you want
saved-cart features). When done, return to the terminal and press Enter.
You'll have `scraper/storage_state.json`.

Open `https://<your-app>.vercel.app/admin` (basic-auth prompt → use your
`ADMIN_USERNAME` / `ADMIN_PASSWORD`). Drop `storage_state.json` into the
upload field. The page shows a green "Healthcheck: OK" badge if Rohlík
returns ≥5 last-minute products with the cookies.

## 6. First settings

Visit `https://<your-app>.vercel.app/settings` (basic-auth → `APP_USERNAME` /
`APP_PASSWORD`). Set:

- **E-mail pro upozornění** — wife's address
- **Čas zaslání** — preferred hour (Europe/Prague)
- **Výchozí minimální sleva** — used as the default % when she adds new items

Save. Then go to `/`, paste a Rohlík product URL, confirm the preview, save.

## 7. Smoke test

Manually run the scrape workflow:

```
GitHub → Actions → daily-scrape → "Run workflow"
```

Watch the job:
- Step "Download warehouse session" pulls the file from Storage.
- Step "Scrape" runs Playwright, autoscrolls, prints how many products it
  found.
- Step "Push to Supabase" inserts rows and triggers `dispatch-alerts`.

In the Supabase SQL editor:

```sql
select started_at, ok, product_count from scrape_runs
  order by started_at desc limit 3;
select count(*) from last_minute_offers
  where scrape_run_id = (select id from scrape_runs order by started_at desc limit 1);
```

If your wishlist has any matching item above its threshold, the email should
arrive within seconds (assuming the current Prague hour ≥ `alert_hour`).

## 8. Optional: custom domain

Vercel → Project → Settings → Domains → Add. Update Supabase Edge Function
secret `APP_URL` to the new origin so email links resolve correctly.

## What to do if something fails

See `docs/MAINTENANCE.md` (TODO if not present yet — for now: open
`scrape_runs.error` for scrape failures, the Edge Function logs in Supabase
for email failures, and re-upload `storage_state.json` if the healthcheck
goes red).
