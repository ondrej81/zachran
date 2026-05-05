# scraper

Production scraper for `https://www.rohlik.cz/zachran-a-usetri`. Runs in
GitHub Actions (`.github/workflows/daily-scrape.yml`), reusable locally.

## One-time setup (admin)

The scrape needs cookies bound to a real delivery address — without them
Rohlík falls back to a default warehouse and the offer set is wrong.

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium

python rohlik_alert.py init
# Chromium opens. Set your delivery address (and log in if you want).
# Press Enter in the terminal. Saves storage_state.json next to this file.
```

Then go to `https://<your-app>.vercel.app/admin` and upload
`storage_state.json`. The web app stores it in a private Supabase Storage
bucket and the GitHub Action pulls it before each run.

## Daily run (GitHub Actions does this automatically)

```bash
python fetch_session.py        # downloads storage_state.json from Supabase
python rohlik_alert.py dump > today.json
python push_to_supabase.py today.json
```

## Local debugging

```bash
# scrape only, save HTML for offline inspection
curl -s https://www.rohlik.cz/zachran-a-usetri > /tmp/rohlik.html
python rohlik_alert.py dump --from-file /tmp/rohlik.html | head
```
