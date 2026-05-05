-- v2: drop the snapshot-based architecture; the dispatch-alerts function now
-- checks each wishlist product directly via its ?lm=1 URL.
--
-- Run this AFTER the function has been redeployed (otherwise the live function
-- will keep referencing the dropped tables and error out for one cron tick).

-- 1) New status columns on wishlist_items so the UI can show "Dnes ve slevě"
--    without joining against a separate snapshot table.
alter table public.wishlist_items
  add column if not exists last_check_at        timestamptz,
  add column if not exists last_sale_price      numeric(10,2),
  add column if not exists last_original_price  numeric(10,2),
  add column if not exists last_discount_pct    int2,
  add column if not exists last_sale_valid_till timestamptz,
  add column if not exists last_check_error     text;

-- 2) alert_log no longer references scrape_runs.
alter table public.alert_log drop column if exists scrape_run_id;

-- 3) Drop the snapshot artifacts and the scrape-related view.
drop view  if exists public.todays_matches;
drop table if exists public.last_minute_offers;
drop table if exists public.scrape_runs;
drop table if exists public.warehouse_sessions;

-- 4) Note: the leftover `warehouse` storage bucket from v1 cannot be dropped
-- from SQL — Supabase blocks direct deletion from storage.* tables. Clean it
-- up manually after this migration finishes:
--   Dashboard → Storage → warehouse bucket → select all objects → Delete →
--   then click the bucket's ⋯ menu → Delete bucket.
-- It's harmless if you skip this; just a few KB of unused storage.

-- 5) Adjust the cron schedule from every 15 min → once per hour at :05.
--    Direct UPDATE on cron.job is denied on Supabase (42501); use the
--    cron.schedule() / cron.unschedule() API instead. We capture the existing
--    command body (which holds your inlined FUNCTIONS_URL and CRON_SECRET
--    from migration 002) and re-schedule it with the new cadence.
do $$
declare
  cmd text;
begin
  select command into cmd from cron.job where jobname = 'dispatch-alerts';
  if cmd is not null then
    perform cron.unschedule('dispatch-alerts');
    perform cron.schedule('dispatch-alerts', '5 * * * *', cmd);
  end if;
end $$;
