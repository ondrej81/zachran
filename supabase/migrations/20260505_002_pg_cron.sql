-- Schedule the dispatch-alerts edge function every 15 minutes.
-- Requires pg_cron + pg_net to be enabled (default on Supabase paid; on free
-- tier enable in Database > Extensions).
--
-- Two settings must be set before this migration runs:
--   alter database postgres set "app.functions_url" = 'https://<ref>.functions.supabase.co';
--   alter database postgres set "app.cron_secret"   = '<the same value as CRON_SECRET in the Edge Function env>';

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'dispatch-alerts',
  '*/15 * * * *',
  $$
    select net.http_post(
      url := current_setting('app.functions_url') || '/dispatch-alerts',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.cron_secret')
      ),
      body := jsonb_build_object('trigger', 'cron')
    );
  $$
);
