-- Step 69 — Decline a suggested change with a reason
--
-- Aalim asked to "let the owner decline with a reason". Whoever declines a
-- suggested change (Step 67) — the entry's owner, a Root of its home tree,
-- or a Branch who tends it (Step 68) — may now say why. The suggester reads
-- it in the notice that tells them it was declined, and the others who were
-- asked see it on theirs.
--
-- 1. `entry_suggestions.decline_reason`: up to 500 characters, and only on
--    a declined suggestion.
-- 2. `public.decide_entry_suggestion(suggestion, accept, reason)`: keeps the
--    reason when declining (none when accepting) and quotes it in the
--    suggester's notice. Otherwise Step 67's body. The two-argument version
--    is dropped in the same transaction, and the new argument has a default,
--    so the app before this still reaches it and nothing is ambiguous.

-- 1. Why it was declined.
alter table public.entry_suggestions
  add column decline_reason text,
  add constraint entry_suggestions_decline_reason check (
    decline_reason is null
    or (status = 'declined' and length(btrim(decline_reason)) between 1 and 500)
  );

-- 2. Declining can say why.
drop function public.decide_entry_suggestion(uuid, boolean);

create function public.decide_entry_suggestion(
  p_suggestion uuid,
  p_accept boolean,
  p_reason text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_suggestion public.entry_suggestions%rowtype;
  v_row public.people%rowtype;
  v_old jsonb;
  v_detail text;
  v_columns text[];
  v_applied text[] := '{}';
  -- Why it was declined (Step 69); accepting keeps none.
  v_reason text := case when not p_accept then nullif(btrim(p_reason), '') end;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_accept is null then
    raise exception 'SUGGESTION: accept or decline it' using errcode = '22023';
  end if;
  if length(v_reason) > 500 then
    raise exception 'SUGGESTION: the reason is longer than 500 characters'
      using errcode = '22001';
  end if;

  select * into v_suggestion
  from public.entry_suggestions where id = p_suggestion
  for update;
  if not found then
    raise exception 'SUGGESTION: withdrawn' using errcode = 'P0002';
  end if;
  if v_suggestion.status <> 'pending' then
    raise exception 'SUGGESTION: already answered' using errcode = '55000';
  end if;
  if not private.can_edit_person(v_suggestion.person_id) then
    raise exception 'SUGGESTION: not yours to answer' using errcode = '42501';
  end if;

  if p_accept then
    select * into v_row from public.people where id = v_suggestion.person_id for update;
    v_old := to_jsonb(v_row);
    v_row := jsonb_populate_record(v_row, v_suggestion.changes);
    -- As their own edit: `person_edit_notify` tells the owner and maker,
    -- and records a Branch's change to a Root's entry for the Root's undo.
    begin
      update public.people set
        first_name = v_row.first_name,
        middle_name = v_row.middle_name,
        preferred_name = v_row.preferred_name,
        maiden_name = v_row.maiden_name,
        last_name = v_row.last_name,
        sex = v_row.sex,
        date_of_birth = v_row.date_of_birth,
        date_of_birth_precision = v_row.date_of_birth_precision,
        birth_month = v_row.birth_month,
        birth_day = v_row.birth_day,
        place_id_birth = v_row.place_id_birth,
        city_of_birth = v_row.city_of_birth,
        country_of_birth = v_row.country_of_birth,
        is_deceased = v_row.is_deceased,
        date_of_death = v_row.date_of_death,
        date_of_death_precision = v_row.date_of_death_precision,
        place_id_death = v_row.place_id_death,
        place_of_death = v_row.place_of_death
      where id = v_suggestion.person_id;
    exception
      when check_violation or not_null_violation or foreign_key_violation then
        raise exception 'SUGGESTION: no longer fits the entry' using errcode = '23514';
    end;

    for v_detail, v_columns in
      select s.detail, s.columns from private.suggestion_columns() s
    loop
      if exists (
        select 1 from unnest(v_columns) c
        where v_suggestion.changes ? c
          and v_old -> c is distinct from v_suggestion.changes -> c
      ) then
        v_applied := array_append(v_applied, v_detail);
      end if;
    end loop;
  end if;

  update public.entry_suggestions
  set status = case when p_accept then 'accepted' else 'declined' end,
      decided_at = now(),
      decided_by = v_uid,
      decline_reason = v_reason
  where id = p_suggestion;

  perform private.notify(
    v_suggestion.suggested_by, v_uid,
    case when p_accept then 'suggestion_accepted' else 'suggestion_declined' end,
    v_suggestion.person_id, null,
    coalesce(private.member_label(v_uid), 'A relative')
      || case when p_accept then ' accepted' else ' declined' end
      || ' your suggested change to '
      || private.person_label(v_suggestion.person_id)
      || coalesce(': “' || v_reason || '”', '.'),
    v_suggestion.tree_id
  );

  return v_applied;
end;
$$;

revoke all on function public.decide_entry_suggestion(uuid, boolean, text) from public, anon;
grant execute on function public.decide_entry_suggestion(uuid, boolean, text) to authenticated;
