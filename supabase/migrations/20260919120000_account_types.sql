-- Step 18 — Account types: Root, Branch, Canopy, Leaf
--
-- Four kinds of member, named for the tree they grow:
--
--     stored key      name     reach
--     admin           Root     the whole tree, and running it
--     branch_admin    Branch   every entry on their own branch (Step 17)
--     member          Canopy   what they add, and their own entry
--     leaf            Leaf     their own entry, nothing else        <- new
--
-- The stored keys stay what they were. Renaming them would rewrite eleven live
-- functions that test `role = 'admin'` and open a window where the deployed
-- site misreads every admin, for no difference anyone can see; and the names
-- are the part most likely to change if these become plans people pay for.
-- `lib/account-types.ts` maps key to name and is the only place that should.
--
-- What a Leaf can still do: view the whole tree, keep their own entry current
-- (details, photo, documents, their card's position), comment on and flag any
-- entry, claim the entry that describes them, and — once, while onboarding —
-- add their own entry and the line that places it. Everything else that grows
-- or reshapes the tree (adding relatives or companions, drawing or removing a
-- connection, answering a connection prompt) is refused here, in the database,
-- not just hidden in the UI.

-- ---------------------------------------------------------------------------
-- The role itself
-- ---------------------------------------------------------------------------

alter table public.profiles
  drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (
    role in ('admin', 'branch_admin', 'member', 'leaf')
  );

create or replace function private.is_leaf()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where auth_user_id = (select auth.uid())
      and role = 'leaf'
  );
$$;

grant execute on function private.is_leaf() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Editing people
-- ---------------------------------------------------------------------------

-- A Leaf edits one entry: their own. The owner / creator rights every other
-- member has would otherwise hand a Leaf who used to be Canopy everything
-- they added back then, which is exactly what the demotion took away.
create or replace function private.can_edit_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      private.is_leaf()
      and p_person_id = private.self_person_id()
    )
    or (
      not private.is_leaf()
      and exists (
        select 1
        from public.people pe
        where pe.id = p_person_id
          and (
            pe.owner_user_id = (select auth.uid())
            or (
              pe.created_by = (select auth.uid())
              and pe.owner_user_id = pe.created_by
              and not private.person_is_claimed(pe.id)
            )
          )
      )
    )
    or (
      private.is_on_own_branch(p_person_id)
      and not private.person_is_someones_own(p_person_id)
    );
$$;

-- ---------------------------------------------------------------------------
-- Editing connections and companions
-- ---------------------------------------------------------------------------

-- Lines belong to the tree's shape, not to one entry, so a Leaf changes none —
-- not even the ones they drew while they were Canopy.
create or replace function private.can_edit_relationship(p_rel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      not private.is_leaf()
      and exists (
        select 1
        from public.relationships r
        where r.id = p_rel_id
          and (
            r.created_by = (select auth.uid())
            or (
              private.is_on_own_branch(r.from_person)
              and private.is_on_own_branch(r.to_person)
            )
          )
      )
    );
$$;

-- A companion is its own chip on the canvas, not part of anyone's entry, so a
-- Leaf leaves those alone too — including a pet that lives with them.
create or replace function private.can_edit_pet(p_pet_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      not private.is_leaf()
      and (
        exists (
          select 1
          from public.pets pt
          where pt.id = p_pet_id
            and pt.created_by = (select auth.uid())
        )
        or exists (
          select 1
          from public.pet_companions c
          where c.pet_id = p_pet_id
            and private.can_edit_person(c.person_id)
        )
      )
    );
$$;

drop policy pets_insert on public.pets;
create policy pets_insert on public.pets
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
    and not (select private.is_leaf())
  );

-- ---------------------------------------------------------------------------
-- Growing the tree: guarded at the table
-- ---------------------------------------------------------------------------
--
-- People and lines are written by SECURITY DEFINER functions
-- (`add_people_with_connections`, `connect_people`, the two connection-prompt
-- resolvers), which RLS never sees. Guarding the tables covers all of them, and
-- any written later, instead of repeating the rule in each.
--
-- The one thing a Leaf may add is their own entry, while onboarding: a single
-- person, in a transaction where they have no entry yet. The guard remembers
-- which person that was (transaction-local), and the line placing it is the
-- only line it lets through.

create or replace function private.leaf_guard_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_leaf() then
    return new;
  end if;

  if private.self_person_id() is not null
     or coalesce(current_setting('ancestree.leaf_seed', true), '') <> '' then
    raise exception 'LEAF_ACCOUNT: a Leaf can only add their own entry'
      using errcode = '42501';
  end if;

  perform set_config('ancestree.leaf_seed', new.id::text, true);
  return new;
end;
$$;

create trigger people_leaf_guard
  before insert on public.people
  for each row execute function private.leaf_guard_people();

create or replace function private.leaf_guard_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed text;
  v_self uuid;
begin
  if not private.is_leaf() then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    -- The line that places the entry they are adding for themselves.
    v_seed := nullif(current_setting('ancestree.leaf_seed', true), '');
    if v_seed is not null
       and v_seed::uuid in (new.from_person, new.to_person) then
      return new;
    end if;
  else
    -- Claiming an entry (`claim_person`) moves the lines off the placeholder
    -- the Leaf joined with and onto the entry they claimed. Those lines
    -- already ran through the Leaf's own entry.
    v_self := private.self_person_id();
    if v_self is not null and v_self in (old.from_person, old.to_person) then
      return coalesce(new, old);
    end if;
  end if;

  raise exception 'LEAF_ACCOUNT: a Leaf can''t change the tree''s connections'
    using errcode = '42501';
end;
$$;

create trigger relationships_leaf_guard
  before insert or update or delete on public.relationships
  for each row execute function private.leaf_guard_relationships();

-- ---------------------------------------------------------------------------
-- my_growth_rights: say so
-- ---------------------------------------------------------------------------

-- `can_add` was true for everyone signed in. A Leaf can add only their own
-- entry, so it is true for them only while they still need one.
create or replace function public.my_growth_rights()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_is_admin boolean;
  v_is_leaf boolean;
  v_self uuid;
  v_tree uuid;
  v_gate boolean := false;
  v_blood boolean := true;
begin
  if v_uid is null then
    return jsonb_build_object(
      'can_add', false, 'is_married_in', false, 'gate_active', false,
      'self_person_id', null, 'onboarding', false
    );
  end if;

  select (role = 'admin'), (role = 'leaf'), self_person_id
    into v_is_admin, v_is_leaf, v_self
  from public.profiles
  where auth_user_id = v_uid;

  if v_self is not null then
    select tree_id into v_tree from public.people where id = v_self;
    v_gate := private.bloodline_gate_active(v_tree);
    v_blood := private.is_bloodline(v_self);
  end if;

  return jsonb_build_object(
    'can_add', coalesce(v_is_leaf, false) is not true or v_self is null,
    'is_married_in', coalesce(v_is_admin, false) is not true
                     and v_self is not null and v_gate and not v_blood,
    'gate_active', v_gate,
    'self_person_id', v_self,
    'onboarding', v_self is null
  );
end;
$$;
