-- Step 4.5d — period-appropriate political names for a place.
-- Curated (not a global import): rows are matched by place_id first, then by
-- country_code, against the event date. A NULL end_date means "still current".

create table if not exists public.historical_names (
  id           bigint generated always as identity primary key,
  place_id     bigint references public.places(id),
  country_code text,
  name         text not null,
  start_date   date,
  end_date     date,
  source       text not null default 'wikidata',
  created_at   timestamptz not null default now(),
  constraint historical_names_scope_ck check (place_id is not null or country_code is not null),
  constraint historical_names_dates_ck check (end_date is null or start_date is null or end_date >= start_date)
);

comment on table public.historical_names is
  'Curated period names for places (Step 4.5d). Matched by place_id then country_code against a birth/death date. Not a global import.';

create index if not exists historical_names_place_id_idx on public.historical_names (place_id);
create index if not exists historical_names_country_code_idx on public.historical_names (country_code);

alter table public.historical_names enable row level security;

drop policy if exists historical_names_select_authenticated on public.historical_names;
create policy historical_names_select_authenticated
  on public.historical_names for select
  to authenticated
  using (true);
