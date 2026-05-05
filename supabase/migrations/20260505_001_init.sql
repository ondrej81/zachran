-- Rohlík wishlist alerter — initial schema.
-- Single-tenant app. RLS is OFF; only the service-role key (used by the
-- Next.js server, GitHub Action, and Edge Function) is allowed to read/write.

create extension if not exists pgcrypto;

-- Singleton config row (id = 1 enforced)
create table public.settings (
  id                       smallint primary key check (id = 1),
  alert_email              text not null,
  alert_hour               int2 not null default 7
                           check (alert_hour between 0 and 23),
  default_min_discount_pct int2 not null default 0
                           check (default_min_discount_pct between 0 and 99),
  warehouse_label          text,
  updated_at               timestamptz not null default now()
);
insert into public.settings (id, alert_email)
  values (1, '')
  on conflict (id) do nothing;

create table public.wishlist_items (
  id                  uuid primary key default gen_random_uuid(),
  rohlik_product_id   bigint not null unique,
  name                text not null,
  image_url           text,
  source_url          text not null,
  min_discount_pct    int2 not null default 0
                      check (min_discount_pct between 0 and 99),
  is_active           boolean not null default true,
  created_at          timestamptz not null default now()
);
create index wishlist_items_active_pid
  on public.wishlist_items (rohlik_product_id) where is_active;

create table public.scrape_runs (
  id              uuid primary key default gen_random_uuid(),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  ok              boolean,
  product_count   int,
  error           text
);
create index scrape_runs_started_at on public.scrape_runs (started_at desc);

create table public.last_minute_offers (
  scrape_run_id      uuid not null references public.scrape_runs(id) on delete cascade,
  rohlik_product_id  bigint not null,
  name               text not null,
  slug               text,
  image_url          text,
  url                text,
  sale_price         numeric(10,2),
  original_price     numeric(10,2),
  currency           text default 'CZK',
  discount_pct       int2,
  sale_text          text,
  sale_valid_till    timestamptz,
  badges             text[],
  raw                jsonb,
  primary key (scrape_run_id, rohlik_product_id)
);
create index last_minute_offers_pid
  on public.last_minute_offers (rohlik_product_id);

-- One row per (product, Prague-date) we emailed about
create table public.alert_log (
  rohlik_product_id    bigint not null,
  alert_date           date not null,
  scrape_run_id        uuid references public.scrape_runs(id) on delete set null,
  matched_discount_pct int2 not null,
  sale_price           numeric(10,2),
  sent_at              timestamptz not null default now(),
  resend_message_id    text,
  primary key (rohlik_product_id, alert_date)
);

create table public.warehouse_sessions (
  id              uuid primary key default gen_random_uuid(),
  uploaded_at     timestamptz not null default now(),
  storage_path    text not null,
  is_current      boolean not null default true,
  healthcheck_ok  boolean,
  healthcheck_at  timestamptz,
  notes           text
);
-- Partial unique index: at most one row may have is_current = true
create unique index only_one_current_session
  on public.warehouse_sessions ((true)) where is_current;

-- Helper view: today's matches that haven't been emailed yet (Prague date)
create or replace view public.todays_matches as
select
  w.id              as wishlist_item_id,
  w.rohlik_product_id,
  w.name            as wishlist_name,
  w.min_discount_pct,
  o.name,
  o.image_url,
  o.url,
  o.sale_price,
  o.original_price,
  o.discount_pct,
  o.sale_text,
  o.sale_valid_till,
  o.scrape_run_id,
  r.started_at
from public.wishlist_items w
join public.last_minute_offers o
  on o.rohlik_product_id = w.rohlik_product_id
join public.scrape_runs r on r.id = o.scrape_run_id
where w.is_active
  and r.ok
  and (r.started_at at time zone 'Europe/Prague')::date
      = (now() at time zone 'Europe/Prague')::date
  and o.discount_pct >= w.min_discount_pct
  and not exists (
    select 1 from public.alert_log a
    where a.rohlik_product_id = w.rohlik_product_id
      and a.alert_date = (now() at time zone 'Europe/Prague')::date
  );

-- Storage bucket for the warehouse session blobs (private)
insert into storage.buckets (id, name, public)
  values ('warehouse', 'warehouse', false)
  on conflict (id) do nothing;
