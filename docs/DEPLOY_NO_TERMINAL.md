# Deploy without using a terminal

End-to-end click-only walkthrough — every step done in a browser. Plan ~45
minutes for a first run.

You'll touch five sites:

1. **Supabase** — database + edge function + warehouse-session storage
2. **Resend** — sends the email
3. **GitHub** — already hosts the code; we add a few secrets and run two workflows
4. **Vercel** — hosts the website your wife uses
5. **rohlik.cz** + **Cookie-Editor browser extension** — to grab the warehouse session

Have this page open on a second monitor or printed out and follow it top to bottom.

---

## 0. Make three random passwords

You need three long random strings. Use a password manager's "generate" button,
or visit a site like [random.org/passwords](https://www.random.org/passwords/?num=3&len=32&format=plain&rnd=new).
Copy the three values into a temporary scratchpad — you'll paste each into
several places.

Call them:

| | length | who sees it |
| --- | --- | --- |
| **CRON_SECRET** | 32+ chars | machines only |
| **APP_PASSWORD** | 12+ chars | your wife |
| **ADMIN_PASSWORD** | 12+ chars | you |

---

## 1. Resend (email)

1. Go to [resend.com](https://resend.com), sign up with your email.
2. Sidebar → **API Keys** → **Create API Key** → name it `rohlik-wishlist`,
   permission **Sending access** → **Create**.
3. Copy the key (it starts with `re_`). Save it as **RESEND_API_KEY** in your
   scratchpad.

You can either verify a domain (sidebar → **Domains** → **Add Domain**, follow
the DNS instructions) or skip that for now and use Resend's shared address
`onboarding@resend.dev`. The shared address works but lands in spam more often.

---

## 2. Supabase

### 2a. Create the project

1. Go to [supabase.com](https://supabase.com) → sign up / log in.
2. **New project** → name `rohlik-wishlist`, pick a region close to you
   (e.g. **Frankfurt EU**), generate a database password (save it).
3. Wait ~2 min for provisioning.

### 2b. Enable two extensions

Sidebar → **Database** → **Extensions**. Search for and enable:

- **pg_cron** (one-click toggle)
- **pg_net** (one-click toggle)

### 2c. Run the schema migration

1. Sidebar → **SQL Editor** → **New query**.
2. Open the migration file in GitHub:
   `supabase/migrations/20260505_001_init.sql`
3. Click GitHub's **Raw** button, copy the whole file.
4. Paste it into the Supabase SQL Editor, click **Run**. You should see
   "Success. No rows returned."

### 2d. Wire up the cron schedule

Still in the SQL Editor, run **first** these two `alter database` lines —
replace `<ref>` with your Supabase project ref (the part before `.supabase.co`
in the URL of your dashboard) and `<CRON_SECRET>` with your scratchpad value:

```sql
alter database postgres set "app.functions_url"
  = 'https://<ref>.functions.supabase.co';
alter database postgres set "app.cron_secret" = '<CRON_SECRET>';
```

Then run **the second migration** the same way you ran the first:
`supabase/migrations/20260505_002_pg_cron.sql` → copy → paste → Run.

### 2e. Save Edge Function secrets

Sidebar → **Edge Functions** → **Secrets** (tab in the top-right of the page).
Add four secrets one by one:

| Key | Value |
| --- | --- |
| `CRON_SECRET` | your scratchpad value |
| `RESEND_API_KEY` | from step 1 |
| `RESEND_FROM` | `Rohlík <onboarding@resend.dev>` (or your verified domain) |
| `APP_URL` | leave empty for now — you'll fill it in at step 5 |

### 2f. Save the project URL and service-role key

Sidebar → **Project Settings** → **API**. Two values you'll need:

- **Project URL** → save as `SUPABASE_URL` in scratchpad
  (looks like `https://abcde.supabase.co`)
- **service_role secret** → save as `SUPABASE_SERVICE_ROLE_KEY`
  (a long `eyJ…` string — handle like a password)

### 2g. Save the access token & project ref (used to deploy the function)

- Top-right avatar → **Account** → **Access Tokens** → **Generate new token**
  → name `github-actions`, copy → save as `SUPABASE_ACCESS_TOKEN`.
- Project ref is the `<ref>` from step 2d (also visible at
  Settings → General → "Reference ID"). Save as `SUPABASE_PROJECT_REF`.

---

## 3. GitHub

### 3a. Add the five secrets

In your repo: **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**. Add five entries:

| Name | Value |
| --- | --- |
| `SUPABASE_URL` | from 2f |
| `SUPABASE_SERVICE_ROLE_KEY` | from 2f |
| `CRON_SECRET` | from your scratchpad |
| `SUPABASE_ACCESS_TOKEN` | from 2g |
| `SUPABASE_PROJECT_REF` | from 2g |

### 3b. Deploy the Edge Function

**Actions** tab → left sidebar → **deploy-function** → **Run workflow** button
(top-right) → **Run workflow** (in the dropdown).

Watch the run. It should turn green in ~30 seconds. This deploys the
`dispatch-alerts` function to your Supabase project — no terminal needed.

(Whenever you push a commit that changes anything under `supabase/functions/`,
this workflow runs automatically.)

---

## 4. Vercel

### 4a. Import the repo

1. Go to [vercel.com](https://vercel.com) → log in with GitHub.
2. **Add New** → **Project** → import the `zachran` repository.
3. **Framework Preset**: Next.js (auto-detected). **Root Directory**: click
   **Edit** → set to `web`.

### 4b. Environment variables

Before clicking **Deploy**, expand **Environment Variables** and add seven:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from 2f |
| `SUPABASE_SERVICE_ROLE_KEY` | from 2f |
| `APP_USERNAME` | e.g. `zena` |
| `APP_PASSWORD` | from your scratchpad |
| `ADMIN_USERNAME` | e.g. `admin` |
| `ADMIN_PASSWORD` | from your scratchpad |
| `CRON_SECRET` | from your scratchpad |

Click **Deploy**. Wait ~2 min.

### 4c. Tell Supabase your app URL

Once Vercel gives you a URL (something like `rohlik-wishlist-abc.vercel.app`),
go back to **Supabase** → **Edge Functions** → **Secrets** → edit `APP_URL`
to `https://rohlik-wishlist-abc.vercel.app`. Save.

---

## 5. Bootstrap the warehouse session

Rohlík's last-minute offers depend on which warehouse serves your delivery
address — so we capture **your** logged-in cookies once and reuse them.

### 5a. Install Cookie-Editor

In your everyday browser (Chrome, Edge, Firefox), install the
[**Cookie-Editor** extension](https://cookie-editor.com/). One-click install.

### 5b. Log into rohlik.cz

1. Open a fresh tab → [rohlik.cz](https://www.rohlik.cz).
2. Log in (or use as a guest — both work).
3. Choose your delivery address. You should see "Doručíme do …" in the
   header with your address.

### 5c. Export cookies

1. Click the Cookie-Editor extension icon (puzzle-piece menu in the toolbar
   if it's pinned there).
2. Top-right of the popup: **Export → JSON**. (On some versions, click the
   ⤓ download icon and choose "JSON".)
3. Cookie-Editor copies the JSON to your clipboard.
4. Open Notepad / TextEdit / any text editor. Paste. Save the file as
   `rohlik-cookies.json` somewhere you can find it.

### 5d. Upload to /admin

1. In your browser, go to `https://<your-app>.vercel.app/admin`.
2. The browser asks for a password — enter `ADMIN_USERNAME` and
   `ADMIN_PASSWORD` (from your scratchpad).
3. Click **Choose file**, pick `rohlik-cookies.json`, click
   **Nahrát session JSON**.
4. You should see a green message:
   *"Nahráno (24 cookies). Healthcheck: OK (28 produktů na stránce)."*

If it says **selhal** (failed): make sure you actually picked your delivery
address on rohlik.cz before exporting cookies. Re-export and re-upload.

---

## 6. First settings + first item

1. Visit `https://<your-app>.vercel.app/`. The browser asks for a password —
   enter `APP_USERNAME` / `APP_PASSWORD`.
2. Top-right → **Nastavení**:
   - **E-mail pro upozornění**: your wife's address
   - **Čas zaslání**: e.g. 7:00
   - **Výchozí minimální sleva**: e.g. 20 %
   - **Uložit**.
3. Back on the main page, paste a Rohlík product URL into the input
   (e.g. `https://www.rohlik.cz/1408933-maso-veprovy-bok-v-celku-s-kuzi`),
   click **Načíst**, adjust the slider, click **Přidat na seznam**.

The item appears in the list. If it's currently in **Zachraň a ušetři** with
a discount above your threshold, you'll see a yellow "Dnes sleva …" badge
right away.

---

## 7. Trigger the first scrape

By default the scrape runs at 04:05 and 06:05 UTC. To verify everything works
right now without waiting:

1. **GitHub** → **Actions** → **daily-scrape** → **Run workflow** → **Run**.
2. Refresh the page; the run should complete in ~3 minutes.
3. Open Vercel app → if you have any wishlist item that matches today's last
   minute offers above its threshold AND the current Prague hour ≥ your
   `alert_hour`, the email arrives within seconds.

---

## What needs ongoing attention

- **Session expiry** — Rohlík cookies last weeks but eventually rotate.
  When the email stops arriving for a few days, repeat **step 5** and watch
  for the green Healthcheck.
- **Resend free tier** — 3,000 emails/month is plenty (≈100 per day). If you
  hit it, Resend will tell you in the dashboard.

Everything else runs on autopilot.

---

## Where to look when something is off

| Symptom | Look here |
| --- | --- |
| Email never arrived | Supabase → **Edge Functions** → `dispatch-alerts` → **Logs** |
| Scrape didn't run | GitHub → **Actions** → **daily-scrape** → most recent run |
| Healthcheck red on /admin | Repeat step 5 with a fresh Cookie-Editor export |
| Wishlist preview returns "couldn't parse product" | The URL must contain a numeric ID like `1234567-…`. Try a different product. |
| Vercel build fails | Make sure **Root Directory** is `web` (Project Settings → General) |
