# Deploy without using a terminal

End-to-end click-only walkthrough — every step done in a browser. Plan ~30
minutes for a first run.

You'll touch four sites:

1. **Resend** — sends the email
2. **Supabase** — database + edge function
3. **GitHub** — already hosts the code; we add a few secrets and run one workflow
4. **Vercel** — hosts the website your wife uses
5. **rohlik.cz** + **Cookie-Editor browser extension** — to grab the warehouse cookie

Have this open on a second monitor and follow it top to bottom.

---

## 0. Make two random passwords

You need two long random strings. Use a password manager's "generate" button,
or [random.org](https://www.random.org/passwords/?num=2&len=32&format=plain&rnd=new).
Copy the values into a temporary scratchpad — you'll paste each into several
places.

| | length | who sees it |
| --- | --- | --- |
| **CRON_SECRET** | 32+ chars | machines only (pg_cron, Edge Function, Vercel) |
| **APP_PASSWORD** | 12+ chars | your wife |

---

## 1. Resend (email)

1. Go to [resend.com](https://resend.com), sign up.
2. Sidebar → **API Keys** → **Create API Key** → name `rohlik-wishlist`,
   permission **Sending access** → **Create**.
3. Copy the `re_…` key. Save as **RESEND_API_KEY** in your scratchpad.

You can either verify a domain (Sidebar → **Domains** → **Add Domain**, follow
DNS instructions) or use Resend's shared `onboarding@resend.dev` for now.

---

## 2. Supabase

### 2a. Create the project

1. Go to [supabase.com](https://supabase.com) → **New project** → name
   `rohlik-wishlist`, region close to you (e.g. **Frankfurt EU**), generate
   a strong DB password (save it).
2. Wait ~2 min for provisioning.

### 2b. Enable two extensions

Sidebar → **Database** → **Extensions**. Search and toggle on:

- **pg_cron**
- **pg_net**

### 2c. Run the schema migrations

Sidebar → **SQL Editor**. Run all three migration files in order. For each:

1. Open the file on GitHub → click **Raw** → copy the whole file.
2. Paste into a new SQL Editor query → click **Run**.

| File |
| --- |
| `supabase/migrations/20260505_001_init.sql` |
| `supabase/migrations/20260505_002_pg_cron.sql` (see substitution note below) |
| `supabase/migrations/20260505_003_simplify.sql` |

For the second migration only, you must replace two placeholders before
running. With the file pasted into the editor, press <kbd>Ctrl/Cmd-F</kbd>,
click the small ⇄ "replace" arrow, and replace:

| Find | Replace with |
| --- | --- |
| `__FUNCTIONS_URL__` | `https://<your-project-ref>.functions.supabase.co` |
| `__CRON_SECRET__` | your CRON_SECRET from the scratchpad |

(Find your project ref at **Settings → General → Reference ID**.)

After all three migrations, verify the cron job:

```sql
select jobid, schedule, jobname from cron.job where jobname = 'dispatch-alerts';
```

You should see one row with schedule `5 * * * *`.

### 2d. Save the project URL, service-role key, access token, project ref

Sidebar → **Project Settings** → **API**:

- **Project URL** → save as `SUPABASE_URL` (e.g. `https://abcde.supabase.co`).
- **service_role secret** → save as `SUPABASE_SERVICE_ROLE_KEY`. This is the
  long `eyJ…` string labelled "secret" — **not** the `anon` key.

Top-right avatar → **Account** → **Access Tokens** → **Generate new token** →
name `github-actions` → **Generate** → save as `SUPABASE_ACCESS_TOKEN`.

The project ref (which you used in 2c) is also saved as `SUPABASE_PROJECT_REF`.

### 2e. Save Edge Function secrets

Sidebar → **Edge Functions** → **Secrets** tab. Add five entries:

| Key | Value |
| --- | --- |
| `CRON_SECRET` | from your scratchpad |
| `RESEND_API_KEY` | from step 1 |
| `RESEND_FROM` | `Rohlík <onboarding@resend.dev>` (or your verified domain) |
| `APP_URL` | leave blank for now — you'll fill it in at step 4c |
| `WAREHOUSE_COOKIE_HEADER` | leave blank for now — you'll fill it in at step 5 |

---

## 3. GitHub

### 3a. Add four secrets

In the repo: **Settings** → **Secrets and variables** → **Actions** →
**New repository secret**:

| Name | Value |
| --- | --- |
| `SUPABASE_ACCESS_TOKEN` | from 2d |
| `SUPABASE_PROJECT_REF` | from 2d |

(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `CRON_SECRET` aren't needed any
more — the Edge Function reads them from Supabase Secrets.)

### 3b. Deploy the Edge Function

**Actions** tab → left sidebar → **deploy-function** → **Run workflow**
(top-right) → **Run workflow** in the dropdown.

Watch the run; it goes green in ~30 seconds. This deploys
`dispatch-alerts` to your Supabase project. Whenever you push a commit that
changes `supabase/functions/`, this workflow auto-runs.

---

## 4. Vercel

### 4a. Import the repo

1. [vercel.com](https://vercel.com) → log in with GitHub → **Add New** →
   **Project** → import `zachran`.
2. **Framework Preset**: Next.js (auto-detected).
3. **Root Directory**: click **Edit** → set to `web` → **Continue**.

### 4b. Environment variables

Before clicking Deploy, expand **Environment Variables** and add four:

| Name | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | from 2d |
| `SUPABASE_SERVICE_ROLE_KEY` | from 2d |
| `APP_USERNAME` | e.g. `zena` |
| `APP_PASSWORD` | from your scratchpad |
| `CRON_SECRET` | from your scratchpad |

Click **Deploy**. Wait ~2 min.

### 4c. Tell Supabase your app URL

Once Vercel gives you a URL like `rohlik-wishlist-abc.vercel.app`, go back to
**Supabase** → **Edge Functions** → **Secrets** → edit `APP_URL` to
`https://rohlik-wishlist-abc.vercel.app` → save.

---

## 5. Capture the warehouse cookie

Rohlík's last-minute offers depend on which warehouse serves your delivery
address. We capture **your** logged-in cookies once and paste them into a
Supabase secret.

### 5a. Install Cookie-Editor

In your everyday browser (Chrome, Edge, Firefox), install the
[**Cookie-Editor** extension](https://cookie-editor.com/). One-click install.

### 5b. Log into rohlik.cz

1. Open a fresh tab → [rohlik.cz](https://www.rohlik.cz).
2. Log in (or use as a guest — both work).
3. Choose your delivery address. The header should read "Doručíme do …".

### 5c. Export the cookie header

1. Click the Cookie-Editor extension icon.
2. **Top-right of the popup → Export → Header String**. (NOT JSON this time —
   the **Header String** form gives you a single line ready to paste.)
3. Cookie-Editor copies a value like
   `PHPSESSID=…; cf_clearance=…; address=…` to your clipboard.

### 5d. Save as Supabase secret

1. Supabase → **Edge Functions** → **Secrets** → edit `WAREHOUSE_COOKIE_HEADER`.
2. Paste the entire header string. **Save**.

---

## 6. First settings + first item

1. Visit `https://<your-app>.vercel.app/`. Browser asks for a password — enter
   `APP_USERNAME` / `APP_PASSWORD`.
2. Top-right → **Nastavení**:
   - **E-mail pro upozornění** — your wife's address
   - **Čas zaslání** — e.g. 7:00
   - **Výchozí minimální sleva** — e.g. 20 %
   - **Uložit**.
3. Back on the main page, paste a Rohlík product URL into the input
   (any product, regular promo or last-minute), click **Načíst**, adjust the
   slider, **Přidat na seznam**.

The item appears in the list. To verify the daily check works without waiting
for tomorrow morning, click the **Aktualizovat** button at the top-right of
the list. After ~5 seconds the page refreshes and the badge under each item
shows today's price (or "Dnes není ve slevě.").

---

## 7. Wait for tomorrow morning

That's it. At your configured `alert_hour`, pg_cron fires the Edge Function,
which fetches each wishlist product, finds the matches, and emails. If there
are no matches, no email is sent.

---

## What needs ongoing attention

- **Cookie expiry.** Rohlík cookies last weeks. If results stop matching what
  you see on rohlik.cz, redo step 5 with a fresh export.
- **Resend free tier.** 3,000 emails/month — plenty for one daily digest.

---

## Where to look when something is off

| Symptom | Look here |
| --- | --- |
| Email never arrived | Supabase → **Edge Functions** → `dispatch-alerts` → **Logs** |
| Wishlist preview returns "couldn't parse product" | URL must contain a numeric ID like `1234567-…` |
| Vercel build fails with "no public/" | Project Settings → General → Root Directory must be `web` |
| `wishlist_items.last_check_error` is set | the function couldn't reach or parse the page; check the message |
