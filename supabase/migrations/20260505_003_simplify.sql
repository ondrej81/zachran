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

-- 4) Remove the warehouse storage bucket and any objects in it.
delete from storage.objects where bucket_id = 'warehouse';
delete from storage.buckets where id        = 'warehouse';

-- 5) Adjust the cron schedule from every 15 min → once per hour at :05.
--    With per-product fetches we don't want to thrash Rohlík between alert
--    hours; a single check at :05 of the alert_hour is enough.
do $$
declare
  jid bigint;
begin
  select jobid into jid from cron.job where jobname = 'dispatch-alerts';
  if jid is not null then
    update cron.job set schedule = '5 * * * *' where jobid = jid;
  end if;
end $$;
