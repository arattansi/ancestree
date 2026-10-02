-- Step 106: your own card on another tree, name only.
--
-- A person may make their own card on a tree that isn't its home a "shell":
-- their name and nothing else — no place of birth, no dates, no photo — drawn
-- as a pill, its lines kept. So may a Root of that tree, for anyone on it who
-- isn't a member there. What the person did stands: no Root lifts it, and
-- taking the card off and bringing it back brings back the shell
-- (`private.card_shells` keeps it). The person may lift it, which leaves the
-- basic card and a yes still theirs to give. A person who is a member of the
-- tree leaves it too, as a Root removing them would; a Root can't, and nobody
-- leaves their only tree this way.
--
-- `approval` gains 'shell'; `detail` reads it as 'basic', so every rule a basic
-- card follows (no photo, stories, album, suggestions; lines drawn) holds, and
-- `basic_tree_people` blanks the place of birth too. Additive for the code
-- that's live: it never sees 'shell' until someone makes one, and reads it as
-- 'none' (a full card's look, with nothing to show) until the new code ships.

-- ---------------------------------------------------------------------------
-- 1. The state
-- ---------------------------------------------------------------------------
alter table public.tree_placements drop constraint tree_placements_approval_check;
alter table public.tree_placements add constraint tree_placements_approval_check
  check (approval in ('none', 'asked', 'approved', 'declined', 'shell'));

alter table public.tree_placements alter column detail set expression as (
  case when approval in ('asked', 'declined', 'shell') then 'basic' else 'full' end
);

-- Who made each shell, and what it was before. A shell the person made
-- outlives its placement, so bringing them back brings it back; a Root's
-- goes with the card.
create table private.card_shells (
  tree_id uuid not null references public.trees (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  by_person boolean not null,
  prior_approval text not null
    check (prior_approval in ('none', 'asked', 'approved', 'declined')),
  prior_asked_at timestamptz,
  made_by uuid references public.profiles (auth_user_id) on delete set null,
  made_at timestamptz not null default now(),
  primary key (tree_id, person_id)
);
revoke all on private.card_shells from public, anon, authenticated;
grant all on private.card_shells to service_role;

-- A card that is anything but a shell has no shell to keep: lifting it, the
-- person joining the tree by an invite, a merge, or the tree becoming its
-- home all end it. Only `place_people` brings a kept shell back.
create or replace function private.card_shells_follow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    delete from private.card_shells s
    where s.tree_id = old.tree_id and s.person_id = old.person_id
      and not s.by_person;
    return old;
  end if;
  if new.approval <> 'shell' then
    delete from private.card_shells s
    where s.tree_id = new.tree_id and s.person_id = new.person_id;
  end if;
  return new;
end;
$$;

create trigger tree_placements_card_shells
  after insert or update of approval or delete on public.tree_placements
  for each row execute function private.card_shells_follow();

-- ---------------------------------------------------------------------------
-- 2. Leaving a tree: what `remove_tree_member` did, for any caller to hand to
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.remove_member_from_tree(p_tree uuid, p_user_id uuid, v_root uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_last boolean;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
begin
  update public.people set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.people set owner_user_id = v_root where owner_user_id = p_user_id and tree_id = p_tree;
  update public.relationships set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.invites set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.share_links set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pets set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pet_companions pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;
  update public.pet_comments pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;

  -- Who placed a card, and the membership itself, change only as a
  -- privileged write (tree_placements_guard, tree_members_guard).
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements set placed_by = v_root where placed_by = p_user_id and tree_id = p_tree;
  delete from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  select not exists (select 1 from public.tree_members where user_id = p_user_id) into v_last;
  if v_last then
    -- Anything left elsewhere (nothing, if every home was this tree) is
    -- reassigned by the caller before the auth user goes.
    update public.people set created_by = v_root where created_by = p_user_id;
    update public.people set owner_user_id = v_root where owner_user_id = p_user_id;
    update public.relationships set created_by = v_root where created_by = p_user_id;
    update public.invites set created_by = v_root where created_by = p_user_id;
    update public.share_links set created_by = v_root where created_by = p_user_id;
    update public.pets set created_by = v_root where created_by = p_user_id;
    update public.pet_companions set created_by = v_root where created_by = p_user_id;
    update public.pet_comments set created_by = v_root where created_by = p_user_id;
    update public.trees set created_by = null where created_by = p_user_id;
    -- A card they placed on a tree they had already left keeps its place,
    -- with nobody recorded as placing it (on delete set null).
    delete from public.profiles where auth_user_id = p_user_id;
  end if;
  return v_last;
end;
$function$
;

revoke all on function private.remove_member_from_tree(uuid, uuid, uuid) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.remove_tree_member(p_tree uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_root uuid := (select auth.uid());
  v_role text;
  v_last boolean;
begin
  if v_root is null or not private.is_root_of(p_tree) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_user_id = v_root then
    raise exception 'cannot remove yourself' using errcode = '22023';
  end if;
  select role into v_role from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  if v_role is null then
    raise exception 'member not found' using errcode = 'P0002';
  end if;
  if v_role = 'admin' then
    raise exception 'ROOT_IS_PERMANENT: cannot remove a Root' using errcode = '22023';
  end if;

  v_last := private.remove_member_from_tree(p_tree, p_user_id, v_root);
  return v_last;
end;
$function$
;

-- ---------------------------------------------------------------------------
-- 3. Name only, and back
-- ---------------------------------------------------------------------------
-- Returns 'name_only', or 'left' when the person also left the tree.
create or replace function public.make_card_name_only(p_tree uuid, p_person uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.tree_placements;
  v_owner uuid;
  v_by_person boolean;
  v_role text;
  v_root uuid;
  v_left boolean := false;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_tree_name text;
  v_who text;
  v_tell uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.tree_placements
  where tree_id = p_tree and person_id = p_person and status = 'active'
  for update;
  if not found then
    raise exception 'NOT_PLACED: They aren''t on this tree' using errcode = 'P0002';
  end if;
  if private.home_tree(p_person) = p_tree then
    raise exception 'HOME_PLACEMENT: change the home tree first' using errcode = '42501';
  end if;

  v_owner := private.person_owner_member(p_person);
  if v_owner = v_uid then
    v_by_person := true;
  elsif private.is_root_of(p_tree) then
    v_by_person := false;
    if v_owner is not null and exists (
      select 1 from public.tree_members m
      where m.tree_id = p_tree and m.user_id = v_owner
    ) then
      raise exception 'MEMBER: remove them from the tree first' using errcode = '42501';
    end if;
  else
    raise exception 'Only they or a Root of this tree can do that' using errcode = '42501';
  end if;

  if v_row.approval = 'shell' then
    -- Theirs to keep, if a Root made it first.
    if v_by_person then
      update private.card_shells set by_person = true, made_by = v_uid
      where tree_id = p_tree and person_id = p_person;
    end if;
    return 'name_only';
  end if;

  if v_by_person then
    select role into v_role from public.tree_members
    where tree_id = p_tree and user_id = v_uid;
    if v_role is not null then
      if v_role = 'admin' then
        raise exception 'ROOT_STAYS: a Root can''t leave their tree' using errcode = '42501';
      end if;
      if not exists (
        select 1 from public.tree_members
        where user_id = v_uid and tree_id <> p_tree
      ) then
        raise exception 'ONLY_TREE: this is their only tree' using errcode = '42501';
      end if;
      select m.user_id into v_root from public.tree_members m
      where m.tree_id = p_tree and m.role = 'admin'
      order by m.created_at, m.user_id
      limit 1;
      perform private.remove_member_from_tree(p_tree, v_uid, v_root);
      v_left := true;
    end if;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements
  set approval = 'shell', answered_by = v_uid, responded_at = now()
  where id = v_row.id;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  insert into private.card_shells
    (tree_id, person_id, by_person, prior_approval, prior_asked_at, made_by)
  values (p_tree, p_person, v_by_person, v_row.approval, v_row.asked_at, v_uid)
  on conflict (tree_id, person_id) do update
    set by_person = excluded.by_person,
        prior_approval = excluded.prior_approval,
        prior_asked_at = excluded.prior_asked_at,
        made_by = excluded.made_by,
        made_at = now();

  -- The tree's Roots hear it from the person.
  if v_by_person then
    select name into v_tree_name from public.trees where id = p_tree;
    v_who := coalesce(private.member_label(v_uid), 'A relative');
    for v_tell in
      select m.user_id from public.tree_members m
      where m.tree_id = p_tree and m.role = 'admin'
    loop
      perform private.notify(
        v_tell, v_uid, 'placement_declined', p_person, null,
        v_who || ' made their card on ' || coalesce(v_tree_name, 'your tree')
          || ' name only' || case when v_left then ' and left the tree.' else '.' end,
        p_tree
      );
    end loop;
  end if;

  return case when v_left then 'left' else 'name_only' end;
end;
$$;

-- The person lifts any shell on their card; a Root, only one a Root made.
-- The person's leaves the basic card, with their yes still to give; a
-- Root's puts back what was there.
create or replace function public.show_card_again(p_tree uuid, p_person uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.tree_placements;
  v_shell private.card_shells;
  v_to text;
  v_asked timestamptz;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_row from public.tree_placements
  where tree_id = p_tree and person_id = p_person and status = 'active'
  for update;
  if not found or v_row.approval <> 'shell' then
    raise exception 'NOT_SHELL: this card isn''t name only' using errcode = 'P0002';
  end if;
  select * into v_shell from private.card_shells
  where tree_id = p_tree and person_id = p_person;

  if private.person_owner_member(p_person) = v_uid then
    v_to := 'declined';
    v_asked := v_row.asked_at;
  elsif private.is_root_of(p_tree) and not coalesce(v_shell.by_person, false) then
    v_to := coalesce(v_shell.prior_approval, 'asked');
    v_asked := case when v_to = 'asked' then coalesce(v_shell.prior_asked_at, now()) else v_row.asked_at end;
  else
    raise exception 'NAME_ONLY_KEPT: only they can show more' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements
  set approval = v_to, asked_at = v_asked, answered_by = v_uid, responded_at = now()
  where id = v_row.id;
  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return v_to;
end;
$$;

revoke all on function public.make_card_name_only(uuid, uuid) from public, anon;
revoke all on function public.show_card_again(uuid, uuid) from public, anon;
grant execute on function public.make_card_name_only(uuid, uuid) to authenticated, service_role;
grant execute on function public.show_card_again(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. What reads it
-- ---------------------------------------------------------------------------
-- A shell isn't asked about, and a yes doesn't undo it.
CREATE OR REPLACE FUNCTION public.answer_placements(p_placement_ids uuid[], p_accept boolean)
 RETURNS TABLE(placement_id uuid, placement_approval text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_ids uuid[] := coalesce(p_placement_ids, '{}');
  v_row public.tree_placements;
  v_owner uuid;
  v_to text := case when p_accept then 'approved' else 'declined' end;
  v_found int := 0;
  v_answered uuid[] := '{}';
  v_group record;
  v_who text;
  v_tree_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_row in
    select * from public.tree_placements
    where id = any (v_ids)
    order by id
    for update
  loop
    v_found := v_found + 1;
    if v_row.tree_id = private.home_tree(v_row.person_id) then
      raise exception 'A home tree shows the whole entry' using errcode = '23514';
    end if;

    v_owner := private.person_owner_member(v_row.person_id);
    if v_owner is not null and v_owner <> v_uid then
      raise exception 'Only the person this entry belongs to can answer' using errcode = '42501';
    end if;
    if v_owner is null and not private.can_edit_person(v_row.person_id) then
      raise exception 'Only someone who can edit this entry can answer' using errcode = '42501';
    end if;

    if v_row.approval = 'shell' then
      raise exception 'NAME_ONLY: this card shows only a name' using errcode = '42501';
    end if;

    -- Said already: nothing to write, nobody to tell. Their own say-so
    -- ('none') is a yes.
    if v_row.approval = v_to or (p_accept and v_row.approval = 'none') then
      placement_id := v_row.id;
      placement_approval := v_row.approval;
      return next;
      continue;
    end if;

    update public.tree_placements
    set approval = v_to, answered_by = v_uid, responded_at = now()
    where id = v_row.id;

    -- Saying yes for their own entry makes them a member there, so they can
    -- keep it and its board up to date. A Root can change the type after.
    if p_accept and v_owner = v_uid then
      perform private.join_tree(v_row.tree_id, v_uid, 'member', v_row.placed_by);
    end if;

    v_answered := v_answered || v_row.id;
    placement_id := v_row.id;
    placement_approval := v_to;
    return next;
  end loop;

  if v_found < cardinality(v_ids) then
    raise exception 'That request no longer exists';
  end if;

  v_who := coalesce(private.member_label(v_uid), 'A relative');
  for v_group in
    select
      pl.tree_id,
      pl.placed_by,
      count(*) as entries,
      (array_agg(pl.person_id order by pl.id))[1] as first_person
    from public.tree_placements pl
    where pl.id = any (v_answered) and pl.placed_by is not null
    group by pl.tree_id, pl.placed_by
  loop
    select name into v_tree_name from public.trees where id = v_group.tree_id;
    perform private.notify(
      v_group.placed_by, v_uid,
      case when p_accept then 'placement_accepted' else 'placement_declined' end,
      case when v_group.entries = 1 then v_group.first_person end,
      null,
      v_who
        || case when p_accept then ' approved ' else ' declined ' end
        || case
             when v_group.entries > 1 then v_group.entries || ' full entries'
             when v_group.first_person = private.self_person_id() then 'their full entry'
             else coalesce(nullif(private.person_label(v_group.first_person), ''), 'an entry')
                    || '''s full entry'
           end
        || ' on ' || coalesce(v_tree_name, 'your tree') || '.',
      v_group.tree_id
    );
  end loop;

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.placement_asks()
 RETURNS TABLE(placement_id uuid, tree_id uuid, tree_name text, person_id uuid, person_name text, own boolean, home_tree_id uuid, home_tree_name text, asked_by_name text, asked_at timestamp with time zone, approval text, responded_at timestamp with time zone)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    pl.id,
    pl.tree_id,
    t.name,
    pl.person_id,
    private.person_label(pl.person_id),
    o.owner is not null,
    pe.tree_id,
    h.name,
    private.member_label(pl.placed_by),
    pl.asked_at,
    private.placement_approval_now(pl.approval, pl.asked_at),
    pl.responded_at
  from public.tree_placements pl
  join public.trees t on t.id = pl.tree_id
  join public.people pe on pe.id = pl.person_id
  join public.trees h on h.id = pe.tree_id
  cross join lateral (select private.person_owner_member(pl.person_id) as owner) o
  where (select auth.uid()) is not null
    and pl.status = 'active'
    and pl.approval not in ('none', 'shell')
    and pl.tree_id <> pe.tree_id
    and case
          when o.owner is not null then o.owner = (select auth.uid())
          else private.can_edit_person(pl.person_id)
        end
  order by pl.asked_at desc nulls last, 5;
$function$
;

-- Bringing back someone who made their card name only brings the shell back.
CREATE OR REPLACE FUNCTION public.place_people(p_tree uuid, p_person_ids uuid[])
 RETURNS TABLE(placed_person_id uuid, placement_status text, placement_approval text, newly_asked boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_owner uuid;
  v_approval text;
  v_was text;
  v_founder uuid;
  v_self uuid;
  v_outside uuid[];
  v_waiting uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select created_by into v_founder from public.trees where id = p_tree;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    if not private.can_see_person(v_person) then
      raise exception 'You can only bring people you can see on a tree you belong to'
        using errcode = '42501';
    end if;

    v_owner := private.person_owner_member(v_person);
    v_approval := case
      when v_owner = v_uid then 'none'
      when v_owner is not null then 'asked'
      when private.can_edit_person(v_person) then 'none'
      else 'asked'
    end;
    newly_asked := false;

    select tp.approval into v_was
    from public.tree_placements tp
    where tp.tree_id = p_tree and tp.person_id = v_person
    for update;

    if found then
      -- Here already, as they are: nobody is asked twice, and a no stands.
      -- Unless the yes is this Root's own to give.
      if v_was in ('asked', 'declined') and v_approval = 'none' then
        update public.tree_placements
        set approval = 'approved', answered_by = v_uid, responded_at = now()
        where tree_id = p_tree and person_id = v_person;
        v_was := 'approved';
      end if;
      v_approval := v_was;
    else
      if exists (
        select 1 from private.card_shells s
        where s.tree_id = p_tree and s.person_id = v_person and s.by_person
      ) then
        v_approval := 'shell';
      end if;
      insert into public.tree_placements
        (tree_id, person_id, status, placed_by, approval, asked_at, responded_at)
      values (
        p_tree, v_person, 'active', v_uid, v_approval,
        case when v_approval = 'asked' then now() end,
        case when v_approval = 'none' then now() end
      );
      newly_asked := v_approval = 'asked';
    end if;

    -- The founder's own entry, on the tree they founded, is its anchor —
    -- as adding themselves would have made it.
    if v_person = v_self
       and v_founder = v_uid
       and not private.bloodline_gate_active(p_tree) then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (p_tree, v_person, v_uid)
      on conflict do nothing;
    end if;

    if newly_asked then
      v_waiting := v_waiting || v_person;
    end if;

    placed_person_id := v_person;
    placement_status := 'active';
    placement_approval := v_approval;
    return next;
  end loop;

  -- Everyone brought over needs a blood tie here (Step 55), judged across
  -- the whole batch.
  v_outside := private.without_blood_tie(p_tree, p_person_ids, p_person_ids);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      coalesce(nullif(private.person_label(v_outside[1]), ''), 'Someone')
      using errcode = '42501',
            detail = v_outside[1]::text;
  end if;

  perform private.ask_about_placements(p_tree, v_waiting, v_uid);

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$function$
;

-- The Root's list says whose shell it is: theirs to lift, or the person's.
drop function public.tree_carried(uuid);
CREATE OR REPLACE FUNCTION public.tree_carried(p_tree uuid)
 RETURNS TABLE(placement_id uuid, person_id uuid, person_name text, home_tree_name text, approval text, detail text, asked_of text, asked_at timestamp with time zone, responded_at timestamp with time zone, name_only_kept boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select
    pl.id,
    pl.person_id,
    private.person_label(pl.person_id),
    h.name,
    private.placement_approval_now(pl.approval, pl.asked_at),
    pl.detail,
    case
      when pl.approval = 'none' then null
      when private.person_owner_member(pl.person_id) is not null then 'owner'
      else 'stewards'
    end,
    pl.asked_at,
    pl.responded_at,
    coalesce(s.by_person, false)
  from public.tree_placements pl
  join public.people pe on pe.id = pl.person_id
  join public.trees h on h.id = pe.tree_id
  left join private.card_shells s on s.tree_id = pl.tree_id and s.person_id = pl.person_id
  where private.is_root_of(p_tree)
    and pl.tree_id = p_tree
    and pl.status = 'active'
    and pe.tree_id <> p_tree
  order by pl.created_at desc, 3;
$function$
;

revoke all on function public.tree_carried(uuid) from public, anon;
grant execute on function public.tree_carried(uuid) to authenticated, service_role;

-- A shell's row: the name, and no place of birth.
create or replace view private.basic_tree_people
with (security_invoker = false) as
 SELECT pl.tree_id,
    pl.id AS placement_id,
    pl.status AS placement_status,
    pl.pos_x,
    pl.pos_y,
    pl.pos_dx,
    pl.pos_dy,
    pl.person_id AS id,
    private.placement_approval_now(pl.approval, pl.asked_at) AS approval,
    pl.detail,
    s.shown,
        CASE
            WHEN s.shown THEN pe.tree_id
            ELSE NULL::uuid
        END AS home_tree_id,
        CASE
            WHEN s.shown THEN pe.first_name
            ELSE NULL::text
        END AS first_name,
        CASE
            WHEN s.shown THEN pe.preferred_name
            ELSE NULL::text
        END AS preferred_name,
        CASE
            WHEN s.shown THEN pe.last_name
            ELSE NULL::text
        END AS last_name,
        CASE
            WHEN s.shown AND pl.approval <> 'shell'::text THEN pe.city_of_birth
            ELSE NULL::text
        END AS city_of_birth,
        CASE
            WHEN s.shown AND pl.approval <> 'shell'::text THEN pe.country_of_birth
            ELSE NULL::text
        END AS country_of_birth,
        CASE
            WHEN s.shown AND pl.approval <> 'shell'::text THEN pe.place_id_birth
            ELSE NULL::bigint
        END AS place_id_birth,
        CASE
            WHEN private.person_owner_member(pl.person_id) IS NOT NULL THEN 'owner'::text
            ELSE 'stewards'::text
        END AS asked_of,
    private.placement_nudge_due(pl.approval, pl.asked_at, pl.reminded_at, pl.lapse_told_at) AS nudge_due,
    pe.placeholder_number
   FROM tree_placements pl
     JOIN people pe ON pe.id = pl.person_id
     CROSS JOIN LATERAL ( SELECT NOT pe.hidden_from_visitors OR private.is_tree_member(pl.tree_id) OR COALESCE(( SELECT auth.role() AS role), ''::text) = 'service_role'::text AS shown) s
  WHERE pl.status = 'active'::text AND pl.detail = 'basic'::text AND (private.can_view_tree(pl.tree_id) OR COALESCE(( SELECT auth.role() AS role), ''::text) = 'service_role'::text);
