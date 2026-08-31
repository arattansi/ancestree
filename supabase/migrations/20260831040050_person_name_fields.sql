-- Rename the person name columns to first_name / last_name and add middle_name.
--
--   people.given_name  -> people.first_name
--   people.family_name -> people.last_name
--   + people.middle_name text (nullable)
--
-- Postgres rewrites the `people_required_identity` CHECK expression and any
-- index definitions to the new column names automatically; the SECURITY DEFINER
-- functions that name the columns in their bodies are recreated below.
--
-- Down: rename the columns back, drop middle_name, and recreate the functions
--   from migrations 20260830220000, 20260830240000, and 20260831010000.

alter table public.people rename column given_name to first_name;
alter table public.people rename column family_name to last_name;
alter table public.people add column middle_name text;

-- ---------------------------------------------------------------------------
-- private.person_label — display label for a person row (mirrors person-name.ts)
-- ---------------------------------------------------------------------------
create or replace function private.person_label(p_person_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select btrim(
    concat_ws(
      ' ',
      coalesce(nullif(btrim(preferred_name), ''), nullif(btrim(first_name), '')),
      nullif(btrim(last_name), '')
    )
  )
  from public.people
  where id = p_person_id;
$$;

grant execute on function private.person_label(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.person_claim_candidates — unclaimed entries that look like the caller
-- ---------------------------------------------------------------------------
create or replace function public.person_claim_candidates()
returns setof public.people
language sql
stable
security definer
set search_path = ''
as $$
  select pe.*
  from public.profiles me
  join public.people self on self.id = me.self_person_id
  join public.people pe on pe.tree_id = self.tree_id
  where me.auth_user_id = (select auth.uid())
    and pe.id <> self.id
    and lower(btrim(pe.last_name)) = lower(btrim(self.last_name))
    and (
      (
        nullif(btrim(self.first_name), '') is not null
        and lower(btrim(self.first_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
      or (
        nullif(btrim(self.preferred_name), '') is not null
        and lower(btrim(self.preferred_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
    )
    -- nobody real is behind the entry yet
    and pe.owner_user_id = pe.created_by
    and not exists (
      select 1 from public.profiles p where p.self_person_id = pe.id
    )
    and not exists (
      select 1 from public.claims c
      where c.person_id = pe.id and c.status = 'approved'
    )
    -- don't re-suggest something this user has already disputed onto
    and not exists (
      select 1 from public.claims c
      where c.person_id = pe.id
        and c.claimant_user_id = (select auth.uid())
        and c.status = 'disputed'
    );
$$;

revoke all on function public.person_claim_candidates() from anon, public;
grant execute on function public.person_claim_candidates() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.claim_person — auto-approve a claim and merge the caller's stub
-- ---------------------------------------------------------------------------
create or replace function public.claim_person(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_creator uuid;
  v_tree uuid;
  v_self_tree uuid;
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self
  from public.profiles
  where auth_user_id = v_uid;

  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  select tree_id, created_by into v_tree, v_creator
  from public.people
  where id = p_person_id;

  if v_tree is null then
    raise exception 'That entry no longer exists';
  end if;

  select tree_id into v_self_tree from public.people where id = v_self;
  if v_tree is distinct from v_self_tree then
    raise exception 'That entry is on a different tree';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  -- Rate limit: 5 claims per rolling 24h.
  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid
    and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.'
      using errcode = '54000';
  end if;

  -- Re-check the name match server-side (mirrors person_claim_candidates).
  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (
        nullif(btrim(s.first_name), '') is not null
        and lower(btrim(s.first_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
      or (
        nullif(btrim(s.preferred_name), '') is not null
        and lower(btrim(s.preferred_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) then
    raise exception 'That entry does not match your name closely enough to claim'
      using errcode = '42501';
  end if;

  -- --- Merge the onboarding stub (v_self) into the claimed entry ---

  -- Remap relationships, dropping any that would self-loop or duplicate.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.tree_id = r.tree_id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = v_self then p_person_id else from_person end,
      to_person = case when to_person = v_self then p_person_id else to_person end
  where from_person = v_self or to_person = v_self;

  -- Carry over documents, comments, and (if the claimed entry has none) the photo.
  update public.documents set person_id = p_person_id where person_id = v_self;
  update public.entry_comments set person_id = p_person_id where person_id = v_self;
  update public.people tgt
  set photo_path = stub.photo_path
  from public.people stub
  where tgt.id = p_person_id
    and stub.id = v_self
    and tgt.photo_path is null
    and stub.photo_path is not null;

  -- Point the profile at the claimed entry *before* deleting the stub so the
  -- self_person_id FK (ON DELETE SET NULL) doesn't wipe it.
  update public.profiles
  set self_person_id = p_person_id
  where auth_user_id = v_uid;

  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator,
    v_uid,
    'claim_approved',
    p_person_id,
    v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.'
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

revoke all on function public.claim_person(uuid) from anon, public;
grant execute on function public.claim_person(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.add_people_with_connections — now also writes middle_name, and reads
-- first_name / last_name keys from each person object.
-- ---------------------------------------------------------------------------
create or replace function public.add_people_with_connections(
  p_people jsonb,
  p_edges jsonb default '[]'::jsonb,
  p_self_index int default null,
  p_suggestions jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_has_profile boolean;
  v_self_existing uuid;
  v_tree uuid;
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
  v_cycle boolean;
  v_unreached uuid[];
  v_self_id uuid := null;
  v_res text;
  v_resolved_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true, (role = 'admin'), self_person_id
    into v_has_profile, v_is_admin, v_self_existing
  from public.profiles
  where auth_user_id = v_uid;

  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;

  if p_people is null
     or jsonb_typeof(p_people) <> 'array'
     or jsonb_array_length(p_people) = 0 then
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

  select id into v_tree from public.trees order by created_at asc limit 1;
  if v_tree is null then
    raise exception 'No family tree exists yet';
  end if;

  -- 1. Insert people (owner + creator = caller).
  for v_i in 0 .. v_count - 1 loop
    v_elem := p_people -> v_i;
    v_deceased := coalesce((v_elem ->> 'is_deceased')::boolean, false);
    insert into public.people (
      tree_id, first_name, middle_name, preferred_name, last_name, maiden_name,
      date_of_birth, city_of_birth, country_of_birth,
      is_deceased, date_of_death, place_of_death, lineage_type,
      created_by, owner_user_id
    ) values (
      v_tree,
      nullif(btrim(v_elem ->> 'first_name'), ''),
      nullif(btrim(v_elem ->> 'middle_name'), ''),
      nullif(btrim(v_elem ->> 'preferred_name'), ''),
      btrim(v_elem ->> 'last_name'),
      nullif(btrim(v_elem ->> 'maiden_name'), ''),
      nullif(v_elem ->> 'date_of_birth', '')::date,
      nullif(btrim(v_elem ->> 'city_of_birth'), ''),
      btrim(v_elem ->> 'country_of_birth'),
      v_deceased,
      case when v_deceased then nullif(v_elem ->> 'date_of_death', '')::date end,
      case when v_deceased then nullif(btrim(v_elem ->> 'place_of_death'), '') end,
      nullif(btrim(v_elem ->> 'lineage_type'), ''),
      v_uid, v_uid
    )
    returning id into v_person;
    v_ids := array_append(v_ids, v_person);
  end loop;

  -- 2. Insert base + additional edges.
  if p_edges is not null and jsonb_typeof(p_edges) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_edges) - 1 loop
      v_edge := p_edges -> v_i;
      v_type := v_edge ->> 'type';
      if v_type is null or v_type not in ('parent', 'spouse') then
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
        case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
        case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
        v_type,
        v_uid,
        case when v_type = 'spouse'
          then nullif(v_edge ->> 'marriage_date', '')::date end,
        case when v_type = 'spouse'
          then coalesce((v_edge ->> 'is_divorced')::boolean, false) else false end,
        case when v_type = 'spouse' and coalesce((v_edge ->> 'is_divorced')::boolean, false)
          then nullif(v_edge ->> 'divorce_date', '')::date end
      )
      on conflict do nothing;
    end loop;
  end if;

  -- 3. Resolved implied connections (Step 11.2 / 11.3).
  if p_suggestions is not null and jsonb_typeof(p_suggestions) = 'array' then
    for v_i in 0 .. jsonb_array_length(p_suggestions) - 1 loop
      v_edge := p_suggestions -> v_i;
      v_type := v_edge ->> 'suggested_type';
      if v_type is null or v_type not in ('spouse', 'parent', 'sibling_check') then
        raise exception 'Unknown suggestion type: %', coalesce(v_type, '(null)');
      end if;
      if (v_edge ->> 'source') is null
         or (v_edge ->> 'source') not in
            ('co_parent', 'unlinked_spouse_child', 'name_dob_match') then
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
        v_tree, v_a, v_b, v_type, v_edge ->> 'source',
        v_res, v_uid,
        case when v_res = 'pending' then null else v_uid end,
        v_resolved_at
      )
      on conflict on constraint connection_suggestions_unique_key do nothing;

      if v_res = 'accepted' and v_type in ('spouse', 'parent') then
        insert into public.relationships (tree_id, from_person, to_person, type, created_by)
        values (
          v_tree,
          case when v_type = 'spouse' then least(v_a, v_b) else v_a end,
          case when v_type = 'spouse' then greatest(v_a, v_b) else v_b end,
          v_type,
          v_uid
        )
        on conflict do nothing;
      end if;
    end loop;
  end if;

  -- 4. Cycle guard: no directed loop in parent edges for this tree.
  with recursive walk as (
    select r.from_person as root, r.to_person as node, 1 as depth
    from public.relationships r
    where r.tree_id = v_tree and r.type = 'parent'
    union all
    select w.root, r.to_person, w.depth + 1
    from walk w
    join public.relationships r
      on r.from_person = w.node
     and r.type = 'parent'
     and r.tree_id = v_tree
    where w.depth < 500 and w.root <> w.node
  )
  select exists (select 1 from walk where root = node) into v_cycle;
  if v_cycle then
    raise exception 'That connection would create a parent/child loop'
      using errcode = '23514';
  end if;

  -- 4b. A pair cannot be both a parent-child and a spouse edge.
  if exists (
    select 1
    from public.relationships p
    join public.relationships s
      on s.tree_id = p.tree_id
     and s.type = 'spouse'
     and least(s.from_person, s.to_person) = least(p.from_person, p.to_person)
     and greatest(s.from_person, s.to_person) = greatest(p.from_person, p.to_person)
    where p.tree_id = v_tree and p.type = 'parent'
  ) then
    raise exception 'Two people cannot be both partners and parent and child'
      using errcode = '23514';
  end if;

  -- 5. Connectivity: every new person must reach a pre-existing tree member
  --    (admins are exempt so they can seed root people).
  if not v_is_admin then
    with recursive rel_edges as (
      select from_person as a, to_person as b
      from public.relationships where tree_id = v_tree
      union all
      select to_person as a, from_person as b
      from public.relationships where tree_id = v_tree
    ),
    reach as (
      select p.id as node
      from public.people p
      where p.tree_id = v_tree
        and not (p.id = any(v_ids))
      union
      select e.b
      from reach r
      join rel_edges e on e.a = r.node
    )
    select array_agg(x) into v_unreached
    from unnest(v_ids) as x
    where x not in (select node from reach);

    if v_unreached is not null and array_length(v_unreached, 1) > 0 then
      raise exception 'New entries must connect to someone already in the tree'
        using errcode = '23514';
    end if;
  end if;

  -- 6. Link the caller's self entry.
  if p_self_index is not null then
    v_self_id := v_ids[p_self_index + 1];
    update public.profiles
       set self_person_id = v_self_id
     where auth_user_id = v_uid;
  end if;

  return jsonb_build_object('ids', to_jsonb(v_ids), 'self_id', v_self_id);
end;
$$;

revoke all on function public.add_people_with_connections(jsonb, jsonb, int, jsonb)
  from anon, public;
grant execute on function public.add_people_with_connections(jsonb, jsonb, int, jsonb)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.start_own_tree — same key rename + middle_name.
-- ---------------------------------------------------------------------------
create or replace function public.start_own_tree(
  p_tree_name text,
  p_bridge_person_id uuid,
  p_person jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_has_profile boolean;
  v_name text := nullif(btrim(p_tree_name), '');
  v_bridge_tree uuid;
  v_new_tree uuid;
  v_deceased boolean;
  v_person uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true into v_has_profile
  from public.profiles where auth_user_id = v_uid;
  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Name your new tree';
  end if;

  select tree_id into v_bridge_tree
  from public.people where id = p_bridge_person_id;
  if v_bridge_tree is null then
    raise exception 'That person is no longer on the tree';
  end if;
  if not private.is_tree_member(v_bridge_tree) then
    raise exception 'You are not a member of that tree' using errcode = '42501';
  end if;

  -- One own-tree per member keeps the v1 seam simple.
  if exists (select 1 from public.tree_bridges b where b.created_by = v_uid) then
    raise exception 'You have already started your own tree'
      using errcode = 'unique_violation';
  end if;

  insert into public.trees (name, created_by)
  values (v_name, v_uid)
  returning id into v_new_tree;

  v_deceased := coalesce((p_person ->> 'is_deceased')::boolean, false);
  insert into public.people (
    tree_id, first_name, middle_name, preferred_name, last_name,
    date_of_birth, city_of_birth, country_of_birth,
    is_deceased, date_of_death, place_of_death,
    created_by, owner_user_id
  ) values (
    v_new_tree,
    nullif(btrim(p_person ->> 'first_name'), ''),
    nullif(btrim(p_person ->> 'middle_name'), ''),
    nullif(btrim(p_person ->> 'preferred_name'), ''),
    btrim(p_person ->> 'last_name'),
    nullif(p_person ->> 'date_of_birth', '')::date,
    nullif(btrim(p_person ->> 'city_of_birth'), ''),
    btrim(p_person ->> 'country_of_birth'),
    v_deceased,
    case when v_deceased then nullif(p_person ->> 'date_of_death', '')::date end,
    case when v_deceased then nullif(btrim(p_person ->> 'place_of_death'), '') end,
    v_uid, v_uid
  )
  returning id into v_person;

  insert into public.tree_bridges
    (from_tree, to_tree, from_person, to_person, type, created_by)
  values
    (v_new_tree, v_bridge_tree, v_person, p_bridge_person_id, 'spouse', v_uid);

  return jsonb_build_object('tree_id', v_new_tree, 'person_id', v_person);
end;
$$;

revoke all on function public.start_own_tree(text, uuid, jsonb) from anon, public;
grant execute on function public.start_own_tree(text, uuid, jsonb)
  to authenticated, service_role;
