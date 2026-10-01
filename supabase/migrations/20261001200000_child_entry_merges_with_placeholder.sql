-- Step 98.3 follow-up: a child's own entry merges with their placeholder.
--
-- Aalim (2026-10-01): "it should merge whenever the child claims the
-- placeholder. it just remains labelled as placeholder to the public until
-- the parent approves it being visible." A child who already has an entry
-- of their own and accepts an invite to claim their placeholder no longer
-- ends up with two records side by side:
--   * `merge_invited_entry` folds the placeholder into their entry (its
--     lines, placement and the rest, as for any stand-in), and their entry
--     takes its number: its details go into `private.withheld_details`
--     (over any the placeholder held back), the columns are emptied, and
--     it's a placeholder on every tree until their parent shows it
--     (`reveal_withheld_details`, which leaves it theirs).
--   * `private.entry_details(person)`: an entry's details as the held-back
--     jsonb has them.
--   * `people_before_write`: that merge may set the number and clear the
--     lineage, under the privileged flag.
--   * `can_delete_person`: a placeholder's parent may delete it only until
--     the child has claimed it (re-created from Step 99's
--     `20261001190000`).

-- An entry's details, as `private.withheld_details` keeps them: only what's
-- set, no lineage (a Root's mark, not theirs to show).
create or replace function private.entry_details(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'first_name', pe.first_name,
    'middle_name', pe.middle_name,
    'preferred_name', pe.preferred_name,
    'maiden_name', pe.maiden_name,
    'last_name', nullif(pe.last_name, ''),
    'date_of_birth', pe.date_of_birth,
    'date_of_birth_precision',
      case when pe.date_of_birth is not null then pe.date_of_birth_precision end,
    'date_of_birth_circa', nullif(pe.date_of_birth_circa, false),
    'birth_month', pe.birth_month,
    'birth_day', pe.birth_day,
    'city_of_birth', nullif(pe.city_of_birth, ''),
    'country_of_birth', nullif(pe.country_of_birth, ''),
    'place_id_birth', pe.place_id_birth,
    'sex', pe.sex,
    'email', pe.email,
    'email_visible', case when pe.email is not null then pe.email_visible end,
    'photo_path', pe.photo_path,
    'photo_crop', pe.photo_crop
  ))
  from public.people pe
  where pe.id = p_person;
$$;

revoke all on function private.entry_details(uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION private.people_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := new.created_by;
    end if;
    if (select auth.uid()) is not null and not private.is_root_of(new.tree_id) then
      new.lineage_type := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and not private.is_root_of(new.tree_id)
       and new.lineage_type is distinct from old.lineage_type
       -- A child's own entry folded into their placeholder is emptied,
       -- lineage too (Step 98.3, `merge_invited_entry`).
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on' then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
    -- Placeholder children (Step 98.2): the number is given only by
    -- `add_placeholder_child`, or by a merge that folds one into the
    -- child's own entry (Step 98.3, under the privileged flag), and never
    -- changed otherwise. Their parent's edit that
    -- gives one any detail clears it and makes the entry theirs, unless the
    -- child has claimed it (Step 98.3).
    if new.placeholder_number is distinct from old.placeholder_number
       and new.placeholder_number is not null
       and (select auth.uid()) is not null
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on' then
      raise exception 'PLACEHOLDER: a placeholder keeps its number'
        using errcode = '42501';
    end if;
    if old.placeholder_number is not null
       and new.placeholder_number is not null
       and (select auth.uid()) is not null
       and
       (new.first_name, new.middle_name, new.preferred_name, new.maiden_name,
        new.last_name, new.date_of_birth, new.birth_month, new.birth_day,
        new.city_of_birth, new.country_of_birth, new.place_id_birth,
        new.is_deceased, new.date_of_death, new.place_of_death,
        new.place_id_death, new.sex, new.lineage_type, new.photo_path,
        new.photo_crop, new.email)
       is distinct from
       (old.first_name, old.middle_name, old.preferred_name, old.maiden_name,
        old.last_name, old.date_of_birth, old.birth_month, old.birth_day,
        old.city_of_birth, old.country_of_birth, old.place_id_birth,
        old.is_deceased, old.date_of_death, old.place_of_death,
        old.place_id_death, old.sex, old.lineage_type, old.photo_path,
        old.photo_crop, old.email) then
      if not private.is_own_child(new.id) then
        raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
          using errcode = '42501';
      end if;
      new.placeholder_number := null;
      if private.person_owner_member(new.id) is null then
        new.owner_user_id := (select auth.uid());
      end if;
    end if;
    -- What was held back of it goes with the placeholder (Step 98.3).
    if old.placeholder_number is not null and new.placeholder_number is null then
      delete from private.withheld_details where person_id = new.id;
    end if;
    -- A living child's date of birth under 18 is their parent's to give
    -- (Step 98), or their own; anyone else's edit, fill, accepted
    -- suggestion or undo that sets one is refused.
    if (select auth.uid()) is not null
       and (new.date_of_birth, new.date_of_birth_precision, new.is_deceased, new.date_of_death)
           is distinct from
           (old.date_of_birth, old.date_of_birth_precision, old.is_deceased, old.date_of_death)
       and not new.is_deceased and new.date_of_death is null
       and private.birth_age(new.date_of_birth, new.date_of_birth_precision) = 'minor'
       and new.id is distinct from private.self_person_id()
       and not private.is_own_child(new.id) then
      raise exception 'MINOR: % is under 18; only their parent can give that date of birth',
        coalesce(nullif(private.person_label(new.id), ''), 'Someone')
        using errcode = '42501';
    end if;
  end if;
  -- A rough date needs its date (Step 81): when the date goes, circa goes.
  if new.date_of_birth is null then
    new.date_of_birth_circa := false;
  end if;
  if new.date_of_death is null then
    new.date_of_death_circa := false;
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.merge_invited_entry(p_invited uuid, p_own uuid, p_tree uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
  v_hold boolean;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A placeholder child (Step 98.3) folds into the child's own entry like
  -- any stand-in, but theirs takes its number too: one record, kept a
  -- placeholder to everyone (its details held back) until their parent
  -- shows it.
  v_hold := v_invited.placeholder_number is not null;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  if v_hold then
    insert into private.withheld_details as w (person_id, details)
    values (
      p_own,
      coalesce((select x.details from private.withheld_details x where x.person_id = p_invited), '{}'::jsonb)
        || coalesce((select x.details from private.withheld_details x where x.person_id = p_own), '{}'::jsonb)
        || private.entry_details(p_own)
    )
    on conflict (person_id) do update set details = excluded.details;
    update public.people set
      first_name = null, middle_name = null, preferred_name = null,
      maiden_name = null, last_name = '', date_of_birth = null,
      date_of_birth_circa = false, birth_month = null, birth_day = null,
      city_of_birth = null, country_of_birth = '', place_id_birth = null,
      sex = null, lineage_type = null, email = null, photo_path = null,
      photo_crop = null, placeholder_number = v_invited.placeholder_number
    where id = p_own;
  end if;

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed_in_full(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          approval = case when tp.approval = 'none' then 'none' else 'approved' end,
          answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end,
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  update public.stories set person_id = p_own where person_id = p_invited;
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = p_invited
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_own
    );
  update public.story_credits set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$function$;

CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    -- A placeholder child's parent (Step 98.2), until the child has
    -- claimed it: then it's the child's own entry (Step 98.3).
    or (
      private.is_placeholder(p_person_id)
      and private.is_own_child(p_person_id)
      and not private.person_is_someones_own(p_person_id)
    )
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.stories s
        where s.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      -- Nor credited them in a story of theirs (Step 99): deleting the entry
      -- would take the credit out of someone else's story.
      and not exists (
        select 1 from public.story_credits sc
        join public.stories s on s.id = sc.story_id
        where sc.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;
