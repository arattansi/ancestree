-- Step 146: a photo's uploader adds, changes or clears when it was taken.
--
-- Aalim asked (2026-10-12): "user can choose to add 'date taken' for
-- photos". Adding a photo already takes one (Step 88.6); editing it
-- (Step 114) didn't. This `edit_album_photo` also takes the date, checked
-- and kept as `add_album_photo` keeps it (null clears it), then edits the
-- rest as the four-argument one does. A new date asks nobody again: it's
-- when, not what, the photo is (my call).
--
-- Additive: a second `edit_album_photo` beside the first, which the code
-- before this still calls by its four names, so it goes live before the
-- code.

create function public.edit_album_photo(
  p_photo uuid,
  p_tree uuid,
  p_description text,
  p_people uuid[],
  p_taken_on date,
  p_taken_precision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_taken date := p_taken_on;
  v_precision text := case when p_taken_on is null then null else coalesce(p_taken_precision, 'day') end;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.album_photos where id = p_photo and created_by = v_uid
  ) then
    raise exception 'ALBUM: not yours to edit' using errcode = '42501';
  end if;
  if v_taken is not null then
    if v_precision not in ('day', 'month', 'year') then
      raise exception 'ALBUM: not a date taken' using errcode = '22023';
    end if;
    -- Kept on the first day of as much of it as is known.
    v_taken := case v_precision
      when 'year' then date_trunc('year', v_taken)::date
      when 'month' then date_trunc('month', v_taken)::date
      else v_taken
    end;
    -- A day ahead: somewhere, it's already tomorrow.
    if v_taken > current_date + 1 then
      raise exception 'ALBUM: taken after today' using errcode = '22023';
    end if;
  end if;

  update public.album_photos
  set taken_on = v_taken, taken_on_precision = v_precision
  where id = p_photo
    and (taken_on, taken_on_precision) is distinct from (v_taken, v_precision);

  -- The rest as before; anything it refuses undoes the date too.
  return public.edit_album_photo(p_photo, p_tree, p_description, p_people);
end;
$$;

revoke all on function public.edit_album_photo(uuid, uuid, text, uuid[], date, text) from public, anon;
grant execute on function public.edit_album_photo(uuid, uuid, text, uuid[], date, text) to authenticated;
