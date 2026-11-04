-- Step 218: a Branch marks anyone on their tree as deceased or living.
--
-- Until now whether someone has died stayed with whoever could edit the
-- entry (Step 44 left it out of filling in): a Branch past their side, or
-- on another member's own entry, could only suggest it. Aalim
-- (2026-11-03): "branches should be able to update the living/deceased
-- statuses on nodes". Asked, he chose every entry whose home tree they're
-- a Branch of, past their side too, and members' own entries with them;
-- the member is told, as with any edit, and can change it back.
--   * `private.can_set_life_status(person)`: whoever can edit it, or a
--     Branch of its home tree. Never a placeholder child, which has no
--     details at all (Step 98.2).
--   * `public.set_life_status(person, deceased, death)`: marks them
--     deceased, with a date and place of death where none is recorded
--     (never over one), or living, which takes the death details away with
--     it, as the edit form does. Nothing else on the entry moves. The update
--     runs as the caller, so `people_before_write` still asks a parent's
--     word for a living child's date of birth under 18 (Step 98), where
--     they live goes once they've died (Step 153), `person_edit_notify`
--     tells the owner and whoever added it and gives a Root undo when a
--     Branch changes what they added, and a birthday card closes on a death
--     (Step 217.5).

CREATE OR REPLACE FUNCTION private.can_set_life_status(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    private.can_edit_person(p_person_id)
    or (
      not private.is_placeholder(p_person_id)
      and private.is_branch_of(private.home_tree(p_person_id))
    ),
    false
  );
$function$;

CREATE OR REPLACE FUNCTION public.set_life_status(
  p_person uuid,
  p_deceased boolean,
  p_death jsonb default '{}'::jsonb
)
 RETURNS text[]
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.people%rowtype;
  v_changed text[] := '{}';
  v_value text;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_deceased is null then
    raise exception 'LIFE_STATUS: say whether they have died' using errcode = '22023';
  end if;
  if p_death is not null and jsonb_typeof(p_death) <> 'object' then
    raise exception 'LIFE_STATUS: the death details are not an object' using errcode = '22023';
  end if;
  if not private.can_set_life_status(p_person) then
    raise exception 'LIFE_STATUS: not yours to change' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person for update;
  if not found then
    raise exception 'LIFE_STATUS: that entry no longer exists' using errcode = '42501';
  end if;

  if p_deceased then
    if not v_row.is_deceased then
      v_row.is_deceased := true;
      v_changed := v_changed || 'is_deceased'::text;
    end if;
    -- A date and place of death where none is recorded, as filling in does.
    v_value := private.fill_value(p_death, 'date_of_death', 10);
    if v_value is not null and v_row.date_of_death is null then
      v_row.date_of_death := v_value::date;
      v_row.date_of_death_precision :=
        coalesce(private.fill_value(p_death, 'date_of_death_precision', 5), 'day');
      v_row.date_of_death_circa :=
        coalesce(private.fill_value(p_death, 'date_of_death_circa', 5), 'false')::boolean;
      v_changed := v_changed || 'date_of_death'::text;
    end if;
    v_value := private.fill_value(p_death, 'place_id_death', 20);
    if v_value is not null
       and v_row.place_id_death is null
       and nullif(btrim(v_row.place_of_death), '') is null then
      v_row.place_id_death := v_value::bigint;
      v_row.place_of_death := private.fill_value(p_death, 'place_of_death', 160);
      v_changed := v_changed || 'place_of_death'::text;
    end if;
  elsif v_row.is_deceased
     or v_row.date_of_death is not null
     or v_row.place_id_death is not null
     or nullif(btrim(v_row.place_of_death), '') is not null then
    -- Living: the death details go with it.
    v_row.is_deceased := false;
    v_row.date_of_death := null;
    v_row.date_of_death_precision := 'day';
    v_row.date_of_death_circa := false;
    v_row.place_id_death := null;
    v_row.place_of_death := null;
    v_changed := v_changed || 'is_deceased'::text;
  end if;

  if array_length(v_changed, 1) is null then
    return v_changed;
  end if;

  update public.people set
    is_deceased = v_row.is_deceased,
    date_of_death = v_row.date_of_death,
    date_of_death_precision = v_row.date_of_death_precision,
    date_of_death_circa = v_row.date_of_death_circa,
    place_id_death = v_row.place_id_death,
    place_of_death = v_row.place_of_death
  where id = p_person;

  return v_changed;
end;
$function$;

revoke all on function public.set_life_status(uuid, boolean, jsonb) from public, anon;
grant execute on function public.set_life_status(uuid, boolean, jsonb) to authenticated;

comment on function public.set_life_status(uuid, boolean, jsonb) is
  'Step 218: mark someone deceased (with a date and place of death where none is recorded) or living (their death details go); whoever can edit the entry, or a Branch of its home tree (private.can_set_life_status). Returns what changed.';
