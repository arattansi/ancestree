-- Step 217.2 — a quicker zone check.
--
-- `private.time_zone_or_null` read `pg_timezone_names` on every call, which
-- reads the whole zone database: fine once, far too slow inside the
-- nudges' loop over everyone with a birthday. A zone is now an IANA-shaped
-- name ("Africa/Lagos", "UTC") that Postgres can convert a time to.
create or replace function private.time_zone_or_null(p_zone text)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_zone text := nullif(btrim(coalesce(p_zone, '')), '');
begin
  if v_zone is null or length(v_zone) > 64
    or v_zone !~ '^[A-Za-z][A-Za-z0-9_+-]*(/[A-Za-z0-9_+-]+)*$' then
    return null;
  end if;
  perform now() at time zone v_zone;
  return v_zone;
exception when others then
  return null;
end;
$$;
