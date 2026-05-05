-- Schedule the dispatch-alerts edge function every 15 minutes.
--
-- ┌────────────────────────────────────────────────────────────────────┐
-- │  BEFORE RUNNING — replace the two placeholders below.              │
-- │                                                                    │
-- │    __FUNCTIONS_URL__   →  https://<project-ref>.functions.supabase.co
-- │                           (Settings → General → Reference ID for   │
-- │                            the project ref)                        │
-- │                                                                    │
-- │    __CRON_SECRET__     →  your CRON_SECRET (the long random        │
-- │                           string from your scratchpad)             │
-- │                                                                    │
-- │  Easiest way: paste the file into the Supabase SQL Editor, press   │
-- │  Ctrl/Cmd-F, click the small ⇄ "replace" arrow on the right of     │
-- │  the search box, and run two replacements.                         │
-- └────────────────────────────────────────────────────────────────────┘
--
-- Why we inline these instead of using GUCs (`current_setting('app.*')`):
-- on Supabase the postgres role in the SQL Editor lacks permission for
-- `alter database postgres set …`, which fails with 42501.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Drop any pre-existing schedule with this name so this migration is
-- idempotent (you can re-run it after rotating CRON_SECRET).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'dispatch-alerts') then
    perform cron.unschedule('dispatch-alerts');
  end if;
end $$;

select cron.schedule(
  'dispatch-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := '__FUNCTIONS_URL__/dispatch-alerts',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer __CRON_SECRET__'
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);
