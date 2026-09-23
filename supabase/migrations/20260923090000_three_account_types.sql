-- Step 34 — Three account types: Root, Branch and Leaf
--
-- The old Leaf, who could keep only their own entry up to date, is gone, and
-- Canopy is called Leaf now (decided 2026-09-22). The stored keys stay as they
-- are, as in Step 18: `member` is the Leaf, and `leaf` is retired. Everyone who
-- was one, on any tree, moves up to `member`.
--
-- The Leaf keeps what Canopy could do, with one change: new entries go on
-- their own line only (`private.line_ids`) — their ancestors, their brothers
-- and sisters and their ancestors', everyone descended from those, and the
-- people those relatives married. It is measured once the call's lines are
-- drawn, so a Leaf can add their great-grandparents, and then those
-- great-grandparents' other children. The bloodline gate still applies on top,
-- as it does for a Branch.
--
-- Everyone who can invite — a Root, a Branch or a Leaf — invites as a Leaf.
-- Only a Root makes someone a Branch or a Root, from the admin console.
--
-- The app that is live when this is applied still offers the old Leaf on the
-- account-type picker and on invites. Until the new code ships, a `leaf` it
-- writes is stored as `member`, the Leaf it means now.
-- `20260923091000_retire_leaf_key` takes that shim out and narrows the check
-- constraints once the new code is live.

-- ---------------------------------------------------------------------------
-- 1. Every Leaf becomes `member`
-- ---------------------------------------------------------------------------
update public.tree_members set role = 'member' where role = 'leaf';
update public.invites set joins_as = 'member' where joins_as = 'leaf';

-- ---------------------------------------------------------------------------
-- 2. A person's own line
-- ---------------------------------------------------------------------------
-- The Step 17 up-then-down walk (`private.branch_ids`), measured from one
-- person, with their brothers and sisters and their ancestors' added before
-- the walk down: a sibling recorded without the shared parents is still on
-- the line, with everyone descended from them. Only siblings of the person
-- and their ancestors count; a cousin's half-brother through the cousin's
-- other parent is no blood of theirs.
create or replace function private.line_ids(p_person uuid, p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select p_person as id
    union
    select r.from_person as id
    from up
    join public.relationships r on r.to_person = up.id and r.type = 'parent'
    where private.is_placed(p_tree, r.from_person)
  ),
  kin as (
    select up.id from up
    union
    select case when r.from_person = kin.id then r.to_person else r.from_person end as id
    from kin
    join public.relationships r
      on r.type = 'sibling' and (r.from_person = kin.id or r.to_person = kin.id)
    where private.is_placed(
      p_tree, case when r.from_person = kin.id then r.to_person else r.from_person end
    )
  ),
  down as (
    select kin.id from kin
    union
    select r.to_person as id
    from down
    join public.relationships r on r.from_person = down.id and r.type = 'parent'
    where private.is_placed(p_tree, r.to_person)
  )
  select id from down
  union
  select case when r.from_person = d.id then r.to_person else r.from_person end
  from down d
  join public.relationships r
    on r.type = 'spouse' and (r.from_person = d.id or r.to_person = d.id)
  where private.is_placed(p_tree, case when r.from_person = d.id then r.to_person else r.from_person end);
$$;

grant execute on function private.line_ids(uuid, uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. A Leaf adds on their own line
-- ---------------------------------------------------------------------------
create or replace function public.add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_self_index integer default null,
  p_suggestions jsonb default '[]'::jsonb,
  p_tree uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_is_root boolean;
  v_self_existing uuid;
  v_ids uuid[] := '{}';
  v_count int;
  v_elem jsonb;
  v_i int;
  v_edge jsonb;
  v_type text;
  v_deceased boolean;
  v_a uuid;
  v_b uuid;
  v_person uuid;
  v_unreached uuid[];
  v_self_id uuid := null;
  v_res text;
  v_resolved_at timestamptz;
  v_allowed uuid[];
  v_outside uuid[];
  v_line_from uuid;
  v_line uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_tree is null then
    raise exception 'No family tree exists yet';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  v_is_root := private.is_root_of(v_tree);

  select self_person_id into v_self_existing
  from public.profiles where auth_user_id = v_uid;

  if p_people is null or jsonb_typeof(p_people) <> 'array' or jsonb_array_length(p_people) = 0 then
    raise exception 'Add at least one person';
  end if;
  v_count := jsonb_array_length(p_people);

  if p_self_index is not null then
    if v_self_existing is not null then
      raise exception 'Your own entry already exists' using errcode = 'unique_violation';
    end if;
    if p_self_index < 0 or p_self_index >= v_count then
      raise exception 'Invalid self index';
    end if;
  end if;

  -- 1. People: home = this tree (the home placement follows by trigger).
  for v_i in 0 .. v_count - 1 loop
    v_elem := p_people -> v_i;
    v_deceased := coalesce((v_elem ->> 'is_deceased')::boolean, false);
    insert into public.people (
      tree_id, first_name, middle_name, preferred_name, last_name, maiden_name,
      date_of_birth, date_of_birth_precision, city_of_birth, country_of_birth,
      is_deceased, date_of_death, date_of_death_precision, place_of_death,
      lineage_type, created_by, owner_user_id
    ) values (
      v_tree,
      nullif(btrim(v_elem ->> 'first_name'), ''),
      nullif(btrim(v_elem ->> 'middle_name'), ''),
      nullif(btrim(v_elem ->> 'preferred_name'), ''),
      btrim(v_elem ->> 'last_name'),
      nullif(btrim(v_elem ->> 'maiden_name'), ''),
      nullif(v_elem ->> 'date_of_birth', '')::date,
      coalesce(nullif(v_elem ->> 'date_of_birth_precision', ''), 'day'),
      nullif(btrim(v_elem ->> 'city_of_birth'), ''),
      btrim(v_elem ->> 'country_of_birth'),
      v_deceased,
      case when v_deceased then nullif(v_elem ->> 'date_of_death', '')::date end,
      case when v_deceased
        then coalesce(nullif(v_elem ->> 'date_of_death_precision', ''), 'day')
        else 'day' end,
      case when v_deceased then nullif(btrim(v_elem ->> 'place_of_death'), '') end,
      nullif(btrim(v_elem ->> 'lineage_type'), ''),
      v_uid, v_uid
    )
    returning id into v_person;
    v_ids := array_append(v_ids, v_person);
  end loop;

  -- 2. Lines, drawn on this tree.
  if p_edges is not null and jsonb_typeof(p_edges) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_edges) - 1 loop
      v_edge := p_edges -> v_i;
      v_type := v_edge ->> 'type';
      if v_type is null or v_type not in ('parent', 'spouse', 'sibling') then
        raise exception 'Unknown relationship type: %', coalesce(v_type, '(null)');
      end if;
      v_a := private.resolve_person_ref(v_edge ->> 'a', v_ids, v_tree);
      v_b := private.resolve_person_ref(v_edge ->> 'b', v_ids, v_tree);
      if v_a = v_b then
        raise exception 'A person cannot connect to themselves';
      end if;
      insert into public.relationships (tree_id, from_person, to_person, type,
        created_by, marriage_date, is_divorced, divorce_date)
      values (
        v_tree,
        case when v_type in ('spouse', 'sibling') then least(v_a, v_b) else v_a end,
        case when v_type in ('spouse', 'sibling') then greatest(v_a, v_b) else v_b end,
        v_type, v_uid,
        case when v_type = 'spouse' then nullif(v_edge ->> 'marriage_date', '')::date end,
        case when v_type = 'spouse' then coalesce((v_edge ->> 'is_divorced')::boolean, false) else false end,
        case when v_type = 'spouse' and coalesce((v_edge ->> 'is_divorced')::boolean, false)
          then nullif(v_edge ->> 'divorce_date', '')::date end
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 3. Resolved implied connections.
  if p_suggestions is not null and jsonb_typeof(p_suggestions) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_suggestions) - 1 loop
      v_edge := p_suggestions -> v_i;
      v_type := v_edge ->> 'suggested_type';
      if v_type is null or v_type not in ('spouse', 'parent', 'sibling_check', 'duplicate_check') then
        raise exception 'Unknown suggestion type: %', coalesce(v_type, '(null)');
      end if;
      if (v_edge ->> 'source') is null or (v_edge ->> 'source') not in
         ('co_parent', 'unlinked_spouse_child', 'sibling_implied_parent', 'shared_neighbours', 'name_dob_match') then
        raise exception 'Unknown suggestion source';
      end if;
      v_res := coalesce(v_edge ->> 'resolution', 'pending');
      if v_res not in ('accepted', 'dismissed', 'pending') then
        raise exception 'Unknown suggestion resolution: %', v_res;
      end if;
      v_a := private.resolve_person_ref(v_edge ->> 'subject', v_ids, v_tree);
      v_b := private.resolve_person_ref(v_edge ->> 'related', v_ids, v_tree);
      if v_a = v_b then
        raise exception 'A suggestion cannot link a person to themselves';
      end if;
      v_resolved_at := case when v_res = 'pending' then null else now() end;

      insert into public.connection_suggestions (
        tree_id, subject_person_id, related_person_id, suggested_type, source,
        status, created_by, resolved_by, resolved_at
      ) values (
        v_tree, v_a, v_b, v_type, v_edge ->> 'source', v_res, v_uid,
        case when v_res = 'pending' then null else v_uid end, v_resolved_at
      )
      on conflict on constraint connection_suggestions_unique_key do nothing;

      if v_res = 'accepted' and v_type in ('spouse', 'parent') then
        insert into public.relationships (tree_id, from_person, to_person, type, created_by)
        values (
          v_tree,
          case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
          case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
          v_type, v_uid
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- 4. No loops, no partner who is also a parent.
  perform private.assert_tree_consistent(v_tree);

  -- 5. Every new person must reach someone already on this tree (Roots may
  --    seed).
  if not v_is_root then
    with recursive placed as (
      select person_id as id from public.tree_placements
      where tree_id = v_tree and status = 'active'
    ),
    rel_edges as (
      select r.from_person as a, r.to_person as b
      from public.relationships r
      join placed pa on pa.id = r.from_person
      join placed pb on pb.id = r.to_person
      union all
      select r.to_person as a, r.from_person as b
      from public.relationships r
      join placed pa on pa.id = r.from_person
      join placed pb on pb.id = r.to_person
    ),
    reach as (
      select id as node from placed where not (id = any(v_ids))
      union
      select e.b from reach r join rel_edges e on e.a = r.node
    )
    select array_agg(x) into v_unreached
    from unnest(v_ids) as x
    where x not in (select node from reach);

    if v_unreached is not null and array_length(v_unreached, 1) > 0 then
      raise exception 'New entries must connect to someone already in the tree'
        using errcode = '23514';
    end if;
  end if;

  -- 5b. Bloodline gate, on this tree.
  if not v_is_root
     and v_self_existing is not null
     and private.bloodline_gate_active(v_tree) then
    v_allowed := array(select private.bloodline_ids(v_tree));

    if not (v_self_existing = any(v_allowed)) then
      v_allowed := v_allowed || array(select private.descendant_ids(v_tree, v_self_existing));

      select array_agg(x) into v_outside
      from unnest(v_ids) as x
      where not (x = any(v_allowed));

      if v_outside is not null and array_length(v_outside, 1) > 0 then
        raise exception 'BLOODLINE_GATE: new entries must connect to the family bloodline'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- 5c. A Leaf adds on their own line (Step 34): every new entry must be on
  --     it once this call's lines are drawn. Measured from their own entry,
  --     or the one this call makes for them, so a new great-grandparent
  --     counts, and so do that great-grandparent's other children after.
  if private.role_in(v_tree) = 'member' then
    v_line_from := coalesce(v_self_existing, v_ids[p_self_index + 1]);
    if v_line_from is null then
      raise exception 'OWN_LINE: a Leaf adds relatives once their own entry is on the tree'
        using errcode = '42501';
    end if;
    v_line := array(select private.line_ids(v_line_from, v_tree));

    select array_agg(x) into v_outside
    from unnest(v_ids) as x
    where not (x = any(v_line));

    if v_outside is not null then
      raise exception 'OWN_LINE: a Leaf adds relatives on their own line'
        using errcode = '42501';
    end if;
  end if;

  -- 6. The caller's own entry; a founding Root's becomes the tree's anchor.
  if p_self_index is not null then
    v_self_id := v_ids[p_self_index + 1];
    update public.profiles set self_person_id = v_self_id where auth_user_id = v_uid;
    if v_is_root then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (v_tree, v_self_id, v_uid)
      on conflict do nothing;
    end if;
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'self_id', v_self_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Every member of a tree may add to it (within the rules above)
-- ---------------------------------------------------------------------------
create or replace function public.my_growth_rights(p_tree uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_role text;
  v_self uuid;
  v_gate boolean := false;
  v_blood boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object(
      'can_add', false, 'is_married_in', false, 'gate_active', false,
      'self_person_id', null, 'onboarding', false
    );
  end if;

  v_role := private.role_in(v_tree);
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;

  if v_self is not null and private.is_placed(v_tree, v_self) then
    v_gate := private.bloodline_gate_active(v_tree);
    v_blood := not v_gate or exists (
      select 1 from private.bloodline_ids(v_tree) b(id) where b.id = v_self
    );
  end if;

  return jsonb_build_object(
    'can_add', v_role is not null,
    'is_married_in', v_role is distinct from 'admin' and v_self is not null and v_gate and not v_blood,
    'gate_active', v_gate,
    'self_person_id', v_self,
    'onboarding', v_self is null or not private.is_placed(v_tree, v_self)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Invites: everyone who can invite, invites as a Leaf
-- ---------------------------------------------------------------------------
-- `leaf` still passes here until `20260923091000_retire_leaf_key`: the guard
-- below stores it as `member` before the insert policy sees the row, and this
-- keeps working whichever of the two looks first.
create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    p_joins_as in ('member', 'leaf')
    and private.role_in(p_tree_id) in ('admin', 'branch_admin', 'member'),
    false
  );
$$;

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The app live before Step 34 still sends the retired Leaf; it means the
  -- Leaf that is `member` now.
  if new.joins_as = 'leaf' then
    new.joins_as := 'member';
  end if;

  if (select auth.uid()) is null or private.is_root_of(new.tree_id) then
    if new.founds_tree and new.person_id is not null then
      raise exception 'A founder invite is not for an entry' using errcode = '42501';
    end if;
    return new;
  end if;

  if new.founds_tree then
    raise exception 'Only a Root can invite someone to found a tree' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
    if new.invited_email is not null and new.invited_email is distinct from old.invited_email then
      raise exception 'Only a Root can change who an invite signs in' using errcode = '42501';
    end if;
  else
    if new.person_id is not null
       and not (new.joins_as = 'member' and private.can_invite_to_claim(new.person_id)) then
      raise exception 'You can invite someone to claim only an unclaimed entry you can edit, and only as a Leaf'
        using errcode = '42501';
    end if;
    if new.invited_email is not null then
      raise exception 'Only a Root can bind an invite to an email address' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Account types: Root, Branch, Leaf
-- ---------------------------------------------------------------------------
-- `set_member_role` still accepts `leaf` from the app live before Step 34;
-- the guard stores it as `member`, whichever way it arrives (a redeemed
-- invite, the picker, a placement).
create or replace function private.tree_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The retired Leaf, from the app live before Step 34, is the Leaf that is
  -- `member` now.
  if tg_op <> 'DELETE' and new.role = 'leaf' then
    new.role := 'member';
  end if;

  -- RPCs (founding, redeeming, handing over) and the service role.
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on'
     or (select auth.uid()) is null then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    raise exception 'Members join a tree through an invite' using errcode = '42501';
  end if;

  -- The tree itself is going: its memberships go with it.
  if tg_op = 'DELETE' and not exists (select 1 from public.trees t where t.id = old.tree_id) then
    return old;
  end if;

  -- Whoever invited them is going: deleting their profile clears the link (on
  -- delete set null) as whoever deleted it, for remove_tree_member a Root who
  -- may not be on this tree.
  if tg_op = 'UPDATE'
     and old.invited_by_user_id is not null and new.invited_by_user_id is null
     and new.tree_id = old.tree_id and new.user_id = old.user_id and new.role = old.role
     and not exists (select 1 from public.profiles p where p.auth_user_id = old.invited_by_user_id) then
    return new;
  end if;

  if not private.is_root_of(old.tree_id) then
    -- Leaving a tree you are not a Root of is the one thing a member may do.
    if tg_op = 'DELETE' and old.user_id = (select auth.uid()) and old.role <> 'admin' then
      return old;
    end if;
    raise exception 'Only a Root of this tree can change its members' using errcode = '42501';
  end if;

  if old.role = 'admin' then
    if tg_op = 'DELETE' or new.role is distinct from 'admin' then
      raise exception 'ROOT_IS_PERMANENT: a Root stays a Root' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'UPDATE' and (new.tree_id <> old.tree_id or new.user_id <> old.user_id) then
    raise exception 'A membership cannot be moved' using errcode = '42501';
  end if;

  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The Leaf guards go
-- ---------------------------------------------------------------------------
-- Nobody is a Leaf of the old kind any more, so what only they were kept
-- from — drawing lines, adding companions, changing lines they drew — is a
-- member's again. Being a member of the tree still matters wherever it did.
create or replace function private.can_edit_relationship(p_rel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationships r
    where r.id = p_rel_id
      and (
        (r.created_by = (select auth.uid()) and private.is_tree_member(r.tree_id))
        or exists (
          select 1
          from public.tree_placements a
          join public.tree_placements b
            on b.tree_id = a.tree_id and b.person_id = r.to_person and b.status = 'active'
          where a.person_id = r.from_person and a.status = 'active'
            and (
              private.is_root_of(a.tree_id)
              or (
                private.is_on_own_branch(r.from_person, a.tree_id)
                and private.is_on_own_branch(r.to_person, a.tree_id)
              )
            )
        )
      )
  );
$$;

create or replace function private.can_connect_on(p_tree uuid, p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_placed(p_tree, p_a)
    and private.is_placed(p_tree, p_b)
    and private.role_in(p_tree) is not null;
$$;

create or replace function private.can_edit_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with t as (select tree_id from public.pets where id = p_pet_id)
  select
    private.is_root_of(t.tree_id)
    or (
      private.is_tree_member(t.tree_id)
      and (
        exists (select 1 from public.pets pt where pt.id = p_pet_id and pt.created_by = (select auth.uid()))
        or exists (
          select 1 from public.pet_companions c
          where c.pet_id = p_pet_id and private.can_edit_person(c.person_id)
        )
      )
    )
  from t;
$$;

drop policy if exists pets_insert on public.pets;
create policy pets_insert on public.pets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
  );

drop trigger if exists people_leaf_guard on public.people;
drop trigger if exists relationships_leaf_guard on public.relationships;
drop function if exists private.leaf_guard_people();
drop function if exists private.leaf_guard_relationships();
drop function if exists private.is_leaf_in(uuid);
