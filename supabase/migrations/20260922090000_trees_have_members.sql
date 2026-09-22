-- Step 25.1 — Trees have members; people have a home and placements
--
-- Until now there was one tree, one account type per account
-- (`profiles.role`), and "the tree" was whichever `trees` row was oldest.
-- This migration lays the model in docs/trees-and-permissions.md:
--
--   * `tree_members (tree_id, user_id, role)` — an account type per tree.
--   * `people.tree_id` is the person's HOME tree; `tree_placements` says which
--     trees show them and where the card sits on each canvas. The home tree
--     always has an active placement (kept by trigger).
--   * A connection is a fact about two people. A tree draws it when both are
--     placed on it. `relationships.tree_id` becomes "drawn on" — who was
--     working where — and drops out of the uniqueness rules.
--   * Comments, documents and notifications carry a `tree_id`: one board, one
--     bank and one inbox per tree.
--   * Every permission helper is re-read against a tree: a person's details
--     follow their home tree's rules; a connection follows any tree that
--     shows both ends; a Leaf is a Leaf in the tree being written to.
--   * The Step 9 seam (`tree_bridges`, `start_own_tree`) and the Step 14.1
--     canvas-interest register go: placements make a second person row
--     unnecessary.
--
-- Compatibility: the deployed app still reads `profiles.role` and
-- `people.pos_*`, and calls the RPCs without a tree. Both columns stay,
-- mirrored by trigger, and every RPC that gained a `p_tree` argument defaults
-- it to the oldest tree, so the app keeps working until the Step 25 code
-- ships. `20260922_..._drop_legacy_single_tree.sql` removes the mirrors.

-- ---------------------------------------------------------------------------
-- 0. Retire the seam and the interest register
-- ---------------------------------------------------------------------------
drop function if exists public.start_own_tree(text, uuid, jsonb);
drop table if exists public.tree_bridges;

drop function if exists public.register_canvas_interest(text);
drop function if exists public.set_canvas_interest_status(uuid, text);
drop function if exists public.canvas_interest_register();
drop table if exists public.canvas_interest;
delete from public.notifications where type = 'canvas_interest';

-- ---------------------------------------------------------------------------
-- 1. trees: a URL slug, one founded tree per member
-- ---------------------------------------------------------------------------
create or replace function private.slugify(p_text text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    btrim(
      regexp_replace(
        regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'),
        '(^-+|-+$)', '', 'g'
      ),
      '-'
    ),
    ''
  );
$$;

alter table public.trees add column if not exists slug text;

update public.trees
set slug = coalesce(private.slugify(name), 'tree')
where slug is null;

-- Disambiguate any clash before the unique index lands.
with numbered as (
  select id, slug, row_number() over (partition by slug order by created_at) as n
  from public.trees
)
update public.trees t
set slug = t.slug || '-' || substr(replace(t.id::text, '-', ''), 1, 4)
from numbered n
where n.id = t.id and n.n > 1;

alter table public.trees alter column slug set not null;
create unique index if not exists trees_slug_key on public.trees (slug);
alter table public.trees
  add constraint trees_slug_shape check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$');

-- A member founds one tree. Roots of several is fine; founding several is not.
create unique index if not exists trees_one_per_founder
  on public.trees (created_by) where created_by is not null;

-- ---------------------------------------------------------------------------
-- 2. tree_members — the account type, per tree
-- ---------------------------------------------------------------------------
create table public.tree_members (
  tree_id uuid not null references public.trees (id) on delete cascade,
  user_id uuid not null references public.profiles (auth_user_id) on delete cascade,
  role text not null default 'member'
    check (role in ('admin', 'branch_admin', 'member', 'leaf')),
  invited_by_user_id uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (tree_id, user_id)
);

create index tree_members_user_idx on public.tree_members (user_id);
create index tree_members_tree_role_idx on public.tree_members (tree_id, role);

create trigger tree_members_set_updated_at
  before update on public.tree_members
  for each row execute function private.set_updated_at();

-- Everyone who has an account today is a member of the one tree, as what
-- their profile says.
insert into public.tree_members (tree_id, user_id, role, invited_by_user_id, created_at)
select private.current_tree_id(), p.auth_user_id, p.role, p.invited_by_user_id, p.created_at
from public.profiles p
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 3. Membership helpers
-- ---------------------------------------------------------------------------
create or replace function private.role_in(p_tree uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select m.role
  from public.tree_members m
  where m.tree_id = p_tree
    and m.user_id = (select auth.uid());
$$;

create or replace function private.is_root_of(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_in(p_tree) = 'admin';
$$;

create or replace function private.is_branch_of(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_in(p_tree) = 'branch_admin';
$$;

create or replace function private.is_leaf_in(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.role_in(p_tree) = 'leaf';
$$;

-- A Root somewhere: for reference data (nicknames) any Root may curate.
create or replace function private.is_any_root()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_members m
    where m.user_id = (select auth.uid()) and m.role = 'admin'
  );
$$;

-- Same name, new meaning: a member of this tree. Every policy that used it
-- keeps working; a Root of another tree is no longer a member of this one.
create or replace function private.is_tree_member(p_tree_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_members m
    where m.tree_id = p_tree_id and m.user_id = (select auth.uid())
  );
$$;

-- Compatibility for the deployed app only (dropped in the cleanup migration):
-- "admin" means Root of the oldest tree.
create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_root_of(private.current_tree_id());
$$;

create or replace function private.is_branch_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_branch_of(private.current_tree_id());
$$;

create or replace function private.is_leaf()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_leaf_in(private.current_tree_id());
$$;

grant execute on function
  private.role_in(uuid), private.is_root_of(uuid), private.is_branch_of(uuid),
  private.is_leaf_in(uuid), private.is_any_root()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. tree_members: Roots set types, Roots are permanent — per tree
-- ---------------------------------------------------------------------------
create or replace function private.tree_members_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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

create trigger tree_members_guard
  before insert or update or delete on public.tree_members
  for each row execute function private.tree_members_guard();

-- Mirror the oldest tree's role back onto `profiles.role` while the deployed
-- app still reads it (cleanup migration drops both column and mirror).
create or replace function private.tree_members_mirror_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- A change that arrived from `profiles.role` itself is already in place.
  if coalesce(current_setting('ancestree.role_forward', true), '') = 'on' then
    return new;
  end if;
  if new.tree_id = private.current_tree_id() then
    perform set_config('ancestree.role_mirror', 'on', true);
    update public.profiles set role = new.role
    where auth_user_id = new.user_id and role is distinct from new.role;
    perform set_config('ancestree.role_mirror', '', true);
  end if;
  return new;
end;
$$;

create trigger tree_members_mirror_role
  after insert or update of role on public.tree_members
  for each row execute function private.tree_members_mirror_role();

-- And the other way: the deployed /admin still writes `profiles.role`.
create or replace function private.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ancestree.role_mirror', true), '') = 'on' then
    return new;
  end if;
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := coalesce(new.role, 'member');
    return new;
  end if;

  if new.role is distinct from old.role then
    -- Forward to the membership row; its guard decides and raises.
    perform set_config('ancestree.role_forward', 'on', true);
    update public.tree_members
    set role = new.role
    where tree_id = private.current_tree_id() and user_id = new.auth_user_id;
    if not found then
      new.role := old.role;
    end if;
    perform set_config('ancestree.role_forward', '', true);
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Placements — which trees show a person, and where
-- ---------------------------------------------------------------------------
create table public.tree_placements (
  id uuid primary key default gen_random_uuid(),
  tree_id uuid not null references public.trees (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'pending', 'declined')),
  pos_x numeric,
  pos_y numeric,
  pos_dx numeric,
  pos_dy numeric,
  placed_by uuid references public.profiles (auth_user_id) on delete set null,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tree_id, person_id)
);

create index tree_placements_person_idx on public.tree_placements (person_id);
create index tree_placements_tree_status_idx on public.tree_placements (tree_id, status);

create trigger tree_placements_set_updated_at
  before update on public.tree_placements
  for each row execute function private.set_updated_at();

-- Everyone is placed on their home tree, where their card already sits.
insert into public.tree_placements
  (tree_id, person_id, status, pos_x, pos_y, pos_dx, pos_dy, placed_by, created_at)
select pe.tree_id, pe.id, 'active', pe.pos_x, pe.pos_y, pe.pos_dx, pe.pos_dy, pe.created_by, pe.created_at
from public.people pe
on conflict do nothing;

-- Hidden from visitors (Step 25.4): drawn blurred on a tree the viewer is not
-- a member of. Off by default.
alter table public.people
  add column if not exists hidden_from_visitors boolean not null default false;

create or replace function private.home_tree(p_person uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select tree_id from public.people where id = p_person;
$$;

create or replace function private.is_placed(p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_person and pl.status = 'active'
  );
$$;

-- A member sees a person when some tree they belong to shows them.
create or replace function private.can_see_person(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_placements pl
    join public.tree_members m on m.tree_id = pl.tree_id
    where pl.person_id = p_person
      and pl.status = 'active'
      and m.user_id = (select auth.uid())
  );
$$;

grant execute on function
  private.home_tree(uuid), private.is_placed(uuid, uuid), private.can_see_person(uuid)
  to authenticated, service_role;

-- The home tree always has an active placement.
create or replace function private.people_home_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tree_placements (tree_id, person_id, status, placed_by, pos_x, pos_y, pos_dx, pos_dy)
  values (new.tree_id, new.id, 'active', new.created_by, new.pos_x, new.pos_y, new.pos_dx, new.pos_dy)
  on conflict (tree_id, person_id) do update
    set status = 'active', responded_at = coalesce(public.tree_placements.responded_at, now());
  return new;
end;
$$;

create trigger people_home_placement
  after insert or update of tree_id on public.people
  for each row execute function private.people_home_placement();

-- Compatibility: while the deployed canvas still drags `people.pos_*`, keep
-- the home placement in step (the cleanup migration drops the columns).
create or replace function private.people_mirror_position()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('ancestree.position_mirror', true), '') = 'on' then
    return new;
  end if;
  update public.tree_placements
  set pos_x = new.pos_x, pos_y = new.pos_y, pos_dx = new.pos_dx, pos_dy = new.pos_dy
  where tree_id = new.tree_id and person_id = new.id;
  return new;
end;
$$;

create trigger people_mirror_position
  after update of pos_x, pos_y, pos_dx, pos_dy on public.people
  for each row execute function private.people_mirror_position();

create or replace function private.tree_placements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home uuid;
  v_privileged boolean :=
    coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on'
    or (select auth.uid()) is null;
begin
  if tg_op = 'DELETE' then
    select tree_id into v_home from public.people where id = old.person_id;
    -- (When the person or the tree is being deleted, the row is already
    -- gone: allowed.)
    if v_home = old.tree_id
       and exists (select 1 from public.trees t where t.id = old.tree_id) then
      raise exception 'HOME_PLACEMENT: change the home tree first' using errcode = '42501';
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE' and not v_privileged then
    -- Members move cards; only the RPCs change what a placement is.
    if new.tree_id <> old.tree_id or new.person_id <> old.person_id
       or new.status <> old.status or new.placed_by is distinct from old.placed_by
       or new.responded_at is distinct from old.responded_at then
      raise exception 'Only a card''s position can be changed here' using errcode = '42501';
    end if;
  end if;

  -- Keep the deployed canvas in step with a home-tree drag.
  if tg_op = 'UPDATE' then
    select tree_id into v_home from public.people where id = new.person_id;
    if v_home = new.tree_id and (
         new.pos_x is distinct from old.pos_x or new.pos_y is distinct from old.pos_y
      or new.pos_dx is distinct from old.pos_dx or new.pos_dy is distinct from old.pos_dy) then
      perform set_config('ancestree.position_mirror', 'on', true);
      update public.people
      set pos_x = new.pos_x, pos_y = new.pos_y, pos_dx = new.pos_dx, pos_dy = new.pos_dy
      where id = new.person_id;
      perform set_config('ancestree.position_mirror', '', true);
    end if;
  end if;
  return new;
end;
$$;

create trigger tree_placements_guard
  before update or delete on public.tree_placements
  for each row execute function private.tree_placements_guard();

-- ---------------------------------------------------------------------------
-- 6. Connections are facts about two people
-- ---------------------------------------------------------------------------
drop index if exists public.relationships_parent_edge_uidx;
drop index if exists public.relationships_spouse_pair_uidx;
drop index if exists public.relationships_sibling_pair_uidx;

create unique index relationships_parent_edge_uidx
  on public.relationships (from_person, to_person) where (type = 'parent');
create unique index relationships_spouse_pair_uidx
  on public.relationships (least(from_person, to_person), greatest(from_person, to_person))
  where (type = 'spouse');
create unique index relationships_sibling_pair_uidx
  on public.relationships (least(from_person, to_person), greatest(from_person, to_person))
  where (type = 'sibling');

-- Sibling pairs a tree shows: both children placed on it.
create or replace view public.sibling_edges
with (security_invoker = true) as
select distinct pl.tree_id, c1.to_person as person_a, c2.to_person as person_b
from public.relationships c1
join public.relationships c2
  on c1.from_person = c2.from_person
 and c1.type = 'parent' and c2.type = 'parent'
 and c1.to_person < c2.to_person
join public.tree_placements pl
  on pl.person_id = c1.to_person and pl.status = 'active'
join public.tree_placements pl2
  on pl2.person_id = c2.to_person and pl2.status = 'active' and pl2.tree_id = pl.tree_id;

-- ---------------------------------------------------------------------------
-- 7. Boards, banks and inboxes carry a tree
-- ---------------------------------------------------------------------------
alter table public.entry_comments
  add column if not exists tree_id uuid references public.trees (id) on delete cascade;
update public.entry_comments c set tree_id = pe.tree_id
from public.people pe where pe.id = c.person_id and c.tree_id is null;
alter table public.entry_comments alter column tree_id set not null;
create index entry_comments_tree_person_idx on public.entry_comments (tree_id, person_id);

alter table public.documents
  add column if not exists tree_id uuid references public.trees (id) on delete cascade,
  add column if not exists shared_across_trees boolean not null default false;
update public.documents d set tree_id = pe.tree_id
from public.people pe where pe.id = d.person_id and d.tree_id is null;
alter table public.documents alter column tree_id set not null;
create index documents_tree_person_idx on public.documents (tree_id, person_id);

alter table public.notifications
  add column if not exists tree_id uuid references public.trees (id) on delete cascade;
update public.notifications n set tree_id = coalesce(
  (select pe.tree_id from public.people pe where pe.id = n.person_id),
  private.current_tree_id()
) where n.tree_id is null;
create index notifications_recipient_tree_idx
  on public.notifications (recipient_user_id, tree_id, created_at desc);

alter table public.invite_requests
  add column if not exists tree_id uuid references public.trees (id) on delete cascade;
update public.invite_requests set tree_id = private.current_tree_id() where tree_id is null;
alter table public.invite_requests alter column tree_id set not null;

alter table public.invites
  add column if not exists founds_tree boolean not null default false;

-- Until the Step 25 code ships, comments and documents arrive without a tree:
-- default to the person's home.
create or replace function private.default_tree_from_person()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tree_id is null then
    new.tree_id := private.home_tree(new.person_id);
  end if;
  return new;
end;
$$;

create trigger entry_comments_default_tree
  before insert on public.entry_comments
  for each row execute function private.default_tree_from_person();
create trigger documents_default_tree
  before insert on public.documents
  for each row execute function private.default_tree_from_person();

-- Notifications: every kind gets the tree; three new kinds for placements.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_verified',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placement_accepted', 'placement_declined'
  )
);

drop function if exists private.notify(uuid, uuid, text, uuid, uuid, text);
create or replace function private.notify(
  p_recipient uuid, p_actor uuid, p_type text, p_person uuid, p_claim uuid,
  p_body text, p_tree uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications
    (recipient_user_id, actor_user_id, type, person_id, claim_id, body, tree_id)
  values (
    p_recipient, p_actor, p_type, p_person, p_claim, p_body,
    coalesce(p_tree, private.home_tree(p_person), private.current_tree_id())
  );
end;
$$;

create or replace function private.notify_edit(
  p_recipient uuid, p_actor uuid, p_person uuid, p_body text, p_revision uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tree uuid := private.home_tree(p_person);
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications
    (recipient_user_id, actor_user_id, type, person_id, body, revision_id, tree_id)
  values (
    p_recipient, p_actor, 'entry_updated', p_person, p_body,
    case
      when p_revision is not null and exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree and m.user_id = p_recipient and m.role = 'admin'
      ) then p_revision
    end,
    v_tree
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Walks, re-read against a tree
-- ---------------------------------------------------------------------------
create or replace function private.bloodline_ids(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive up as (
    select a.person_id as id
    from public.bloodline_anchors a
    where a.tree_id = p_tree
    union
    select r.from_person as id
    from up
    join public.relationships r on r.to_person = up.id and r.type = 'parent'
    where private.is_placed(p_tree, r.from_person)
  ),
  down as (
    select up.id from up
    union
    select r.to_person as id
    from down
    join public.relationships r on r.from_person = down.id and r.type = 'parent'
    where private.is_placed(p_tree, r.to_person)
  )
  select id from down;
$$;

create or replace function private.descendant_ids(p_tree uuid, p_root uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with recursive down as (
    select p_root as id
    union
    select r.to_person as id
    from down
    join public.relationships r on r.from_person = down.id and r.type = 'parent'
    where private.is_placed(p_tree, r.to_person)
  )
  select id from down;
$$;

-- The branch measured from one person, kept to the people a tree shows.
drop function if exists private.branch_ids(uuid);
create or replace function private.branch_ids(p_person uuid, p_tree uuid)
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
  down as (
    select up.id from up
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

drop function if exists private.root_person_ids();
create or replace function private.root_person_ids(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.self_person_id
  from public.tree_members m
  join public.profiles p on p.auth_user_id = m.user_id
  where m.tree_id = p_tree
    and m.role = 'admin'
    and p.self_person_id is not null
    and private.is_placed(p_tree, p.self_person_id);
$$;

drop function if exists private.own_branch_ids();
create or replace function private.own_branch_ids(p_tree uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  with own as (
    select id from private.branch_ids(private.self_person_id(), p_tree) as b(id)
  ),
  sides as (
    select r.root, b.id
    from private.root_person_ids(p_tree) as r(root)
    cross join lateral private.branch_ids(r.root, p_tree) as b(id)
  )
  select distinct s.id
  from sides s
  join own o on o.id = s.id
  where s.root in (select root from sides where id = private.self_person_id());
$$;

drop function if exists private.is_on_own_branch(uuid);
create or replace function private.is_on_own_branch(p_person_id uuid, p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_branch_of(p_tree)
    and exists (select 1 from private.own_branch_ids(p_tree) b where b = p_person_id);
$$;

grant execute on function
  private.branch_ids(uuid, uuid), private.root_person_ids(uuid),
  private.own_branch_ids(uuid), private.is_on_own_branch(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. Permissions
-- ---------------------------------------------------------------------------
-- A person's details follow their HOME tree.
create or replace function private.can_edit_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select
    private.is_root_of(h.tree)
    or p_person_id = private.self_person_id()
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
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
      private.is_on_own_branch(p_person_id, h.tree)
      and not private.person_is_someones_own(p_person_id)
    )
  from h;
$$;

create or replace function private.can_delete_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select
    private.is_root_of(h.tree)
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
        select 1 from public.entry_comments ec
        where ec.person_id = p_person_id and ec.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.documents d
        where d.person_id = p_person_id and d.uploaded_by is distinct from (select auth.uid())
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
    )
  from h;
$$;

-- A connection follows any tree that shows both ends.
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
        (r.created_by = (select auth.uid()) and not private.is_leaf_in(r.tree_id))
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

-- May the caller draw a line between these two on this tree?
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
    and private.role_in(p_tree) is not null
    and not private.is_leaf_in(p_tree);
$$;

-- Documents (Step 18.4, per tree): the rule is evaluated in the tree the
-- document was uploaded onto; a shared document, in every tree that shows
-- the person.
create or replace function private.document_rule_in(p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_root_of(p_tree)
    or p_person = private.self_person_id()
    or exists (
      select 1 from public.people pe
      where pe.id = p_person and pe.owner_user_id = (select auth.uid())
    )
    or private.is_on_own_branch(p_person, p_tree);
$$;

create or replace function private.can_see_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and (
        (private.is_placed(d.tree_id, d.person_id) and private.document_rule_in(d.tree_id, d.person_id))
        or (
          d.shared_across_trees
          and exists (
            select 1 from public.tree_placements pl
            where pl.person_id = d.person_id and pl.status = 'active'
              and private.document_rule_in(pl.tree_id, d.person_id)
          )
        )
      )
  );
$$;

-- Kept for the storage path policy: the person's documents anywhere the
-- caller may see them.
create or replace function private.can_see_documents(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_placements pl
    where pl.person_id = p_person_id and pl.status = 'active'
      and private.document_rule_in(pl.tree_id, p_person_id)
  );
$$;

create or replace function private.can_write_document(p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_placed(p_tree, p_person)
    and private.is_tree_member(p_tree)
    and (private.can_edit_person(p_person) or private.is_root_of(p_tree));
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
      not coalesce(private.is_leaf_in(t.tree_id), true)
      and private.is_tree_member(t.tree_id)
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

create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_root_of(p_tree_id)
    or (p_joins_as = 'leaf' and private.role_in(p_tree_id) in ('branch_admin', 'member'));
$$;

create or replace function private.can_invite_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select
    private.role_in(h.tree) in ('admin', 'branch_admin', 'member')
    and private.can_edit_person(p_person_id)
    and not private.person_is_claimed(p_person_id)
    and exists (
      select 1 from public.people pe
      where pe.id = p_person_id and pe.owner_user_id = pe.created_by and not pe.is_deceased
    )
    and not exists (select 1 from public.profiles p where p.self_person_id = p_person_id)
  from h;
$$;

grant execute on function
  private.can_connect_on(uuid, uuid, uuid), private.document_rule_in(uuid, uuid),
  private.can_see_document(uuid), private.can_write_document(uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Triggers, per tree
-- ---------------------------------------------------------------------------
create or replace function private.people_before_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
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
       and new.lineage_type is distinct from old.lineage_type then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create or replace function private.leaf_guard_people()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce(private.is_leaf_in(new.tree_id), false) then
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

create or replace function private.leaf_guard_relationships()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed text;
  v_self uuid;
  v_tree uuid := coalesce(new.tree_id, old.tree_id);
begin
  if not coalesce(private.is_leaf_in(v_tree), false) then
    return coalesce(new, old);
  end if;

  if tg_op = 'INSERT' then
    v_seed := nullif(current_setting('ancestree.leaf_seed', true), '');
    if v_seed is not null and v_seed::uuid in (new.from_person, new.to_person) then
      return new;
    end if;
  else
    v_self := private.self_person_id();
    if v_self is not null and v_self in (old.from_person, old.to_person) then
      return coalesce(new, old);
    end if;
  end if;

  raise exception 'LEAF_ACCOUNT: a Leaf can''t change the tree''s connections'
    using errcode = '42501';
end;
$$;

create or replace function private.person_added_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_root uuid;
  v_body text;
begin
  select coalesce(nullif(btrim(display_name), ''), 'a member')
    into v_actor_name
  from public.profiles where auth_user_id = v_actor;

  v_body := coalesce(nullif(private.person_label(new.id), ''), 'A new relative')
    || ' was added to the tree by ' || coalesce(v_actor_name, 'a member') || '.';

  for v_root in
    select user_id from public.tree_members where tree_id = new.tree_id and role = 'admin'
  loop
    perform private.notify(v_root, v_actor, 'person_added', new.id, null, v_body, new.tree_id);
  end loop;
  return new;
end;
$$;

create or replace function private.person_edit_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_label text;
  v_changes text[] := '{}';
  v_body text;
  v_old jsonb;
  v_new jsonb;
  v_before jsonb := '{}';
  v_after jsonb := '{}';
  v_field text;
  v_revision uuid;
begin
  if new.first_name is distinct from old.first_name
     or new.preferred_name is distinct from old.preferred_name
     or new.middle_name is distinct from old.middle_name then
    v_changes := v_changes || 'name'::text;
  end if;
  if new.last_name is distinct from old.last_name
     or new.maiden_name is distinct from old.maiden_name then
    v_changes := v_changes || 'family name'::text;
  end if;
  if new.date_of_birth is distinct from old.date_of_birth
     or new.date_of_birth_precision is distinct from old.date_of_birth_precision then
    v_changes := v_changes || 'date of birth'::text;
  end if;
  if new.city_of_birth is distinct from old.city_of_birth
     or new.country_of_birth is distinct from old.country_of_birth
     or new.place_id_birth is distinct from old.place_id_birth then
    v_changes := v_changes || 'birthplace'::text;
  end if;
  if new.is_deceased is distinct from old.is_deceased
     or new.date_of_death is distinct from old.date_of_death
     or new.date_of_death_precision is distinct from old.date_of_death_precision
     or new.place_of_death is distinct from old.place_of_death
     or new.place_id_death is distinct from old.place_id_death then
    v_changes := v_changes || 'death details'::text;
  end if;
  if new.sex is distinct from old.sex then
    v_changes := v_changes || 'sex'::text;
  end if;
  if new.lineage_type is distinct from old.lineage_type then
    v_changes := v_changes || 'lineage'::text;
  end if;
  if new.photo_path is distinct from old.photo_path
     or new.photo_crop is distinct from old.photo_crop then
    v_changes := v_changes || 'photo'::text;
  end if;

  if array_length(v_changes, 1) is null then
    return new;
  end if;

  v_label := private.person_label(new.id);
  v_body := v_label || ' was updated: ' || array_to_string(v_changes, ', ') || '.';

  -- A Branch of the home tree changing what one of its Roots owns or added.
  if v_actor is not null
     and private.is_branch_of(new.tree_id)
     and v_actor is distinct from new.owner_user_id
     and v_actor is distinct from new.created_by
     and exists (
       select 1 from public.tree_members m
       where m.tree_id = new.tree_id and m.role = 'admin'
         and m.user_id in (new.owner_user_id, new.created_by)
     )
  then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    foreach v_field in array private.revision_fields() loop
      if v_old -> v_field is distinct from v_new -> v_field then
        v_before := v_before || jsonb_build_object(v_field, v_old -> v_field);
        v_after := v_after || jsonb_build_object(v_field, v_new -> v_field);
      end if;
    end loop;

    if v_before <> '{}'::jsonb then
      insert into public.entry_revisions (person_id, editor_user_id, before, after)
      values (new.id, v_actor, v_before, v_after)
      returning id into v_revision;

      v_body := coalesce(private.member_label(v_actor), 'A Branch')
        || ' updated ' || v_label || ': ' || array_to_string(v_changes, ', ') || '.';
    end if;
  end if;

  perform private.notify_edit(new.owner_user_id, v_actor, new.id, v_body, v_revision);
  if new.created_by is distinct from new.owner_user_id then
    perform private.notify_edit(new.created_by, v_actor, new.id, v_body, v_revision);
  end if;
  return new;
end;
$$;

create or replace function private.entry_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_creator uuid;
  v_actor uuid := (select auth.uid());
  v_label text;
  v_type text;
  v_snippet text;
begin
  select owner_user_id, created_by into v_owner, v_creator
  from public.people where id = new.person_id;
  v_label := private.person_label(new.person_id);
  v_snippet := left(btrim(new.body), 140);

  if tg_op = 'INSERT' then
    v_type := case when new.is_flag then 'entry_flagged' else 'entry_commented' end;
    perform private.notify(
      v_owner, v_actor, v_type, new.person_id, null,
      v_label || case when new.is_flag then ' was flagged: ' else ' has a new comment: ' end || v_snippet,
      new.tree_id
    );
    if v_creator is distinct from v_owner then
      perform private.notify(
        v_creator, v_actor, v_type, new.person_id, null,
        v_label || case when new.is_flag then ' was flagged: ' else ' has a new comment: ' end || v_snippet,
        new.tree_id
      );
    end if;
    return new;
  end if;

  if old.status = 'open' and new.status = 'resolved' then
    perform private.notify(
      new.created_by, v_actor, 'flag_resolved', new.person_id, null,
      'Your flag on ' || v_label || ' was resolved.', new.tree_id
    );
  end if;
  return new;
end;
$$;

create or replace function private.pet_companions_same_tree()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.pets pt
    where pt.id = new.pet_id and private.is_placed(pt.tree_id, new.person_id)
  ) then
    raise exception 'A pet and its companion must be on the same tree.';
  end if;
  return new;
end;
$$;

-- Only the person themselves or a Root of the home tree shares a document
-- across trees.
create or replace function private.documents_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.shared_across_trees is distinct from old.shared_across_trees
     and (select auth.uid()) is not null
     and not (
       new.person_id = private.self_person_id()
       or private.is_root_of(private.home_tree(new.person_id))
       or exists (
         select 1 from public.claims c
         where c.person_id = new.person_id and c.status = 'approved'
           and c.claimant_user_id = (select auth.uid())
       )
     ) then
    raise exception 'Only this person, or a Root of their home tree, can share a document across trees'
      using errcode = '42501';
  end if;
  if new.tree_id <> old.tree_id or new.person_id <> old.person_id then
    raise exception 'A document stays where it was uploaded' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger documents_guard
  before update on public.documents
  for each row execute function private.documents_guard();

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
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
       and not (new.joins_as = 'leaf' and private.can_invite_to_claim(new.person_id)) then
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
-- 11. Policies
-- ---------------------------------------------------------------------------
-- trees
drop policy if exists trees_select on public.trees;
drop policy if exists trees_insert on public.trees;
drop policy if exists trees_update on public.trees;
drop policy if exists trees_delete on public.trees;
create policy trees_select on public.trees for select to authenticated
  using ((select private.is_tree_member(id)));
create policy trees_update on public.trees for update to authenticated
  using ((select private.is_root_of(id))) with check ((select private.is_root_of(id)));
create policy trees_delete on public.trees for delete to authenticated
  using ((select private.is_root_of(id)));
-- (no insert policy: trees are founded through `found_tree` / a founder invite)

-- tree_members
alter table public.tree_members enable row level security;
create policy tree_members_select on public.tree_members for select to authenticated
  using ((select private.is_tree_member(tree_id)));
create policy tree_members_update on public.tree_members for update to authenticated
  using ((select private.is_root_of(tree_id))) with check ((select private.is_root_of(tree_id)));
create policy tree_members_delete on public.tree_members for delete to authenticated
  using ((select private.is_root_of(tree_id)) or user_id = (select auth.uid()));
revoke all on table public.tree_members from anon, public;
grant select, update, delete on table public.tree_members to authenticated;
grant all on table public.tree_members to service_role;

-- tree_placements
alter table public.tree_placements enable row level security;
create policy tree_placements_select on public.tree_placements for select to authenticated
  using (
    (select private.is_tree_member(tree_id))
    or person_id = (select private.self_person_id())
  );
create policy tree_placements_update on public.tree_placements for update to authenticated
  using (
    (select private.is_root_of(tree_id))
    or ((select private.is_tree_member(tree_id)) and (select private.can_edit_person(person_id)))
  )
  with check (
    (select private.is_root_of(tree_id))
    or ((select private.is_tree_member(tree_id)) and (select private.can_edit_person(person_id)))
  );
create policy tree_placements_delete on public.tree_placements for delete to authenticated
  using (
    (select private.is_root_of(tree_id))
    or person_id = (select private.self_person_id())
  );
revoke all on table public.tree_placements from anon, public;
grant select, update, delete on table public.tree_placements to authenticated;
grant all on table public.tree_placements to service_role;

-- profiles: you see the members of your trees, and yourself
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1
      from public.tree_members mine
      join public.tree_members theirs on theirs.tree_id = mine.tree_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = profiles.auth_user_id
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (auth_user_id = (select auth.uid())) with check (auth_user_id = (select auth.uid()));
-- (no delete policy: accounts go through deleteAccount / remove_tree_member)

-- people
drop policy if exists people_select on public.people;
drop policy if exists people_insert on public.people;
create policy people_select on public.people for select to authenticated
  using ((select private.can_see_person(id)));
create policy people_insert on public.people for insert to authenticated
  with check ((select private.is_root_of(tree_id)) and created_by = (select auth.uid()));

-- relationships
drop policy if exists relationships_select on public.relationships;
drop policy if exists relationships_insert on public.relationships;
create policy relationships_select on public.relationships for select to authenticated
  using ((select private.can_see_person(from_person)) and (select private.can_see_person(to_person)));
create policy relationships_insert on public.relationships for insert to authenticated
  with check (
    (select private.is_root_of(tree_id))
    and created_by = (select auth.uid())
    and (select private.is_placed(tree_id, from_person))
    and (select private.is_placed(tree_id, to_person))
  );

-- claims
drop policy if exists claims_select on public.claims;
drop policy if exists claims_insert on public.claims;
drop policy if exists claims_update on public.claims;
drop policy if exists claims_delete on public.claims;
create policy claims_select on public.claims for select to authenticated
  using ((select private.can_see_person(person_id)));
create policy claims_insert on public.claims for insert to authenticated
  with check (claimant_user_id = (select auth.uid()) and (select private.can_see_person(person_id)));
create policy claims_update on public.claims for update to authenticated
  using (
    (select private.is_root_of(private.home_tree(person_id)))
    or exists (select 1 from public.people pe where pe.id = claims.person_id and pe.created_by = (select auth.uid()))
  )
  with check (
    (select private.is_root_of(private.home_tree(person_id)))
    or exists (select 1 from public.people pe where pe.id = claims.person_id and pe.created_by = (select auth.uid()))
  );
create policy claims_delete on public.claims for delete to authenticated
  using ((select private.is_root_of(private.home_tree(person_id))));

-- connection_suggestions
drop policy if exists connection_suggestions_update on public.connection_suggestions;
create policy connection_suggestions_update on public.connection_suggestions for update to authenticated
  using ((select private.is_root_of(tree_id)) or created_by = (select auth.uid()))
  with check ((select private.is_root_of(tree_id)) or created_by = (select auth.uid()));

-- entry_comments: one board per tree
drop policy if exists entry_comments_select on public.entry_comments;
drop policy if exists entry_comments_insert on public.entry_comments;
drop policy if exists entry_comments_update on public.entry_comments;
drop policy if exists entry_comments_delete on public.entry_comments;
create policy entry_comments_select on public.entry_comments for select to authenticated
  using ((select private.is_tree_member(tree_id)));
create policy entry_comments_insert on public.entry_comments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
    and (select private.is_placed(tree_id, person_id))
  );
create policy entry_comments_update on public.entry_comments for update to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.can_edit_person(person_id))
    or (select private.is_root_of(tree_id))
  )
  with check (
    created_by = (select auth.uid())
    or (select private.can_edit_person(person_id))
    or (select private.is_root_of(tree_id))
  );
create policy entry_comments_delete on public.entry_comments for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- documents: one bank per tree
drop policy if exists documents_select on public.documents;
drop policy if exists documents_insert on public.documents;
drop policy if exists documents_update on public.documents;
drop policy if exists documents_delete on public.documents;
create policy documents_select on public.documents for select to authenticated
  using ((select private.can_see_document(id)));
create policy documents_insert on public.documents for insert to authenticated
  with check (uploaded_by = (select auth.uid()) and (select private.can_write_document(tree_id, person_id)));
create policy documents_update on public.documents for update to authenticated
  using ((select private.can_write_document(tree_id, person_id)))
  with check ((select private.can_write_document(tree_id, person_id)));
create policy documents_delete on public.documents for delete to authenticated
  using ((select private.can_write_document(tree_id, person_id)));

-- entry_revisions: Roots of the home tree
drop policy if exists entry_revisions_select on public.entry_revisions;
create policy entry_revisions_select on public.entry_revisions for select to authenticated
  using ((select private.is_root_of(private.home_tree(person_id))));

-- invites
drop policy if exists invites_select on public.invites;
drop policy if exists invites_update on public.invites;
drop policy if exists invites_delete on public.invites;
create policy invites_select on public.invites for select to authenticated
  using (
    (select private.is_root_of(tree_id))
    or created_by = (select auth.uid())
    or accepted_by_user_id = (select auth.uid())
  );
create policy invites_update on public.invites for update to authenticated
  using ((select private.is_root_of(tree_id)) or created_by = (select auth.uid()))
  with check ((select private.is_root_of(tree_id)) or created_by = (select auth.uid()));
create policy invites_delete on public.invites for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- invite_requests
drop policy if exists invite_requests_select on public.invite_requests;
drop policy if exists invite_requests_insert on public.invite_requests;
drop policy if exists invite_requests_update on public.invite_requests;
drop policy if exists invite_requests_delete on public.invite_requests;
create policy invite_requests_select on public.invite_requests for select to authenticated
  using ((select private.is_root_of(tree_id)));
create policy invite_requests_insert on public.invite_requests for insert to authenticated
  with check ((select private.is_root_of(tree_id)));
create policy invite_requests_update on public.invite_requests for update to authenticated
  using ((select private.is_root_of(tree_id))) with check ((select private.is_root_of(tree_id)));
create policy invite_requests_delete on public.invite_requests for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- share_links
drop policy if exists share_links_select on public.share_links;
drop policy if exists share_links_insert on public.share_links;
drop policy if exists share_links_update on public.share_links;
drop policy if exists share_links_delete on public.share_links;
create policy share_links_select on public.share_links for select to authenticated
  using ((select private.is_root_of(tree_id)));
create policy share_links_insert on public.share_links for insert to authenticated
  with check ((select private.is_root_of(tree_id)));
create policy share_links_update on public.share_links for update to authenticated
  using ((select private.is_root_of(tree_id))) with check ((select private.is_root_of(tree_id)));
create policy share_links_delete on public.share_links for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- bloodline_anchors
drop policy if exists bloodline_anchors_insert on public.bloodline_anchors;
drop policy if exists bloodline_anchors_delete on public.bloodline_anchors;
create policy bloodline_anchors_insert on public.bloodline_anchors for insert to authenticated
  with check ((select private.is_root_of(tree_id)));
create policy bloodline_anchors_delete on public.bloodline_anchors for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- notifications: a Root of the tree may clear an inbox row
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete to authenticated
  using (recipient_user_id = (select auth.uid()) or (select private.is_root_of(tree_id)));

-- pets
drop policy if exists pets_insert on public.pets;
create policy pets_insert on public.pets for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
    and not (select private.is_leaf_in(tree_id))
  );

-- reference data
drop policy if exists name_nicknames_write_admin on public.name_nicknames;
create policy name_nicknames_write_admin on public.name_nicknames for all to authenticated
  using ((select private.is_any_root())) with check ((select private.is_any_root()));

-- storage: photos are part of the person; documents follow their bank
drop policy if exists storage_photos_select on storage.objects;
create policy storage_photos_select on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (
      (select private.can_see_person(private.uuid_or_null((storage.foldername(name))[2])))
      or (
        (storage.foldername(name))[2] = 'pets'
        and (select private.is_tree_member(private.uuid_or_null((storage.foldername(name))[1])))
      )
    )
  );
drop policy if exists storage_photos_delete on storage.objects;
create policy storage_photos_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'photos'
    and (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
  );
drop policy if exists storage_documents_select on storage.objects;
create policy storage_documents_select on storage.objects for select to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.file_path = objects.name and (select private.can_see_document(d.id))
    )
  );
drop policy if exists storage_documents_insert on storage.objects;
create policy storage_documents_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documents'
    and (select private.can_write_document(
      private.uuid_or_null((storage.foldername(name))[1]),
      private.uuid_or_null((storage.foldername(name))[2])
    ))
  );
drop policy if exists storage_documents_update on storage.objects;
create policy storage_documents_update on storage.objects for update to authenticated
  using (
    bucket_id = 'documents'
    and exists (
      select 1 from public.documents d
      where d.file_path = objects.name and (select private.can_write_document(d.tree_id, d.person_id))
    )
  );
drop policy if exists storage_documents_delete on storage.objects;
create policy storage_documents_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'documents'
    and (
      exists (
        select 1 from public.documents d
        where d.file_path = objects.name and (select private.can_write_document(d.tree_id, d.person_id))
      )
      -- The row goes first when a document is removed; the file follows.
      or (select private.can_edit_person(private.uuid_or_null((storage.foldername(name))[2])))
      or (select private.is_root_of(private.uuid_or_null((storage.foldername(name))[1])))
    )
  );

-- ---------------------------------------------------------------------------
-- 12. member_directory: per tree
-- ---------------------------------------------------------------------------
drop view if exists public.member_directory;
create view public.member_directory
with (security_invoker = true) as
select
  m.tree_id,
  p.auth_user_id,
  p.display_name,
  m.role,
  m.created_at as joined_at,
  p.created_at,
  m.invited_by_user_id,
  inviter.display_name as invited_by_name,
  p.self_person_id
from public.tree_members m
join public.profiles p on p.auth_user_id = m.user_id
left join public.profiles inviter on inviter.auth_user_id = m.invited_by_user_id;
grant select on public.member_directory to authenticated;

-- ---------------------------------------------------------------------------
-- 13. RPCs — joining, founding, placing
-- ---------------------------------------------------------------------------
-- Add someone to a tree (privileged; the guard is bypassed by the GUC).
create or replace function private.join_tree(
  p_tree uuid, p_user uuid, p_role text, p_invited_by uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
begin
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  insert into public.tree_members (tree_id, user_id, role, invited_by_user_id)
  values (p_tree, p_user, p_role, p_invited_by)
  on conflict (tree_id, user_id) do nothing;
  perform set_config('ancestree.privileged_profile_write', v_was, true);
end;
$$;

-- A fresh tree with `p_user` as its founding Root.
create or replace function private.found_tree_for(p_user uuid, p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_slug text;
  v_tree public.trees;
begin
  if v_name is null then
    raise exception 'Name your tree' using errcode = '22023';
  end if;
  if exists (select 1 from public.trees t where t.created_by = p_user) then
    raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
  end if;

  v_slug := coalesce(private.slugify(v_name), 'tree');
  if exists (select 1 from public.trees t where t.slug = v_slug) then
    v_slug := v_slug || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
  end if;

  insert into public.trees (name, slug, created_by)
  values (v_name, v_slug, p_user)
  returning * into v_tree;

  perform private.join_tree(v_tree.id, p_user, 'admin', null);
  return v_tree;
end;
$$;

-- A member starts a tree of their own (the married-in path).
create or replace function public.found_tree(p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where auth_user_id = v_uid) then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  return private.found_tree_for(v_uid, p_name);
end;
$$;

revoke all on function public.found_tree(text) from anon, public;
grant execute on function public.found_tree(text) to authenticated, service_role;

create or replace function public.rename_tree(p_tree uuid, p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_slug text;
  v_tree public.trees;
begin
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can rename a tree' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Name your tree' using errcode = '22023';
  end if;
  v_slug := coalesce(private.slugify(v_name), 'tree');
  if exists (select 1 from public.trees t where t.slug = v_slug and t.id <> p_tree) then
    v_slug := v_slug || '-' || substr(encode(gen_random_bytes(3), 'hex'), 1, 4);
  end if;
  update public.trees set name = v_name, slug = v_slug where id = p_tree
  returning * into v_tree;
  return v_tree;
end;
$$;

revoke all on function public.rename_tree(uuid, text) from anon, public;
grant execute on function public.rename_tree(uuid, text) to authenticated, service_role;

-- Whose own entry is this, if anyone's? (self link or approved claim)
create or replace function private.person_owner_member(p_person uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.auth_user_id from public.profiles p where p.self_person_id = p_person limit 1),
    (select c.claimant_user_id from public.claims c
     where c.person_id = p_person and c.status = 'approved' limit 1)
  );
$$;

-- A Root brings people onto their tree. Someone else's own entry waits for
-- that member to accept; everyone else is placed at once. Returns one row
-- per person with the resulting status.
create or replace function public.place_people(p_tree uuid, p_person_ids uuid[])
returns table (placed_person_id uuid, placement_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_owner uuid;
  v_status text;
  v_tree_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select name into v_tree_name from public.trees where id = p_tree;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    if not private.can_see_person(v_person) then
      raise exception 'You can only bring people you can see on a tree you belong to'
        using errcode = '42501';
    end if;

    v_owner := private.person_owner_member(v_person);
    v_status := case when v_owner is null or v_owner = v_uid then 'active' else 'pending' end;

    insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
    values (p_tree, v_person, v_status, v_uid, case when v_status = 'active' then now() end)
    on conflict (tree_id, person_id) do update
      set status = case when tp.status = 'active' then 'active' else excluded.status end,
          placed_by = excluded.placed_by,
          responded_at = case when excluded.status = 'active' then now() end
    returning tp.status into v_status;

    if v_status = 'pending' then
      perform private.notify(
        v_owner, v_uid, 'placement_requested', v_person, null,
        coalesce(private.member_label(v_uid), 'A Root')
          || ' would like to show your entry on ' || coalesce(v_tree_name, 'their tree')
          || '. Accept or decline from your account.',
        p_tree
      );
    end if;

    placed_person_id := v_person;
    placement_status := v_status;
    return next;
  end loop;

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.place_people(uuid, uuid[]) from anon, public;
grant execute on function public.place_people(uuid, uuid[]) to authenticated, service_role;

-- The person a placement is waiting on accepts or declines it.
create or replace function public.respond_to_placement(p_placement_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.tree_placements;
  v_tree_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_row from public.tree_placements where id = p_placement_id for update;
  if not found then
    raise exception 'That request no longer exists';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'That request was already answered';
  end if;
  if private.person_owner_member(v_row.person_id) is distinct from v_uid then
    raise exception 'Only the person this entry belongs to can answer' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.tree_placements
  set status = case when p_accept then 'active' else 'declined' end,
      responded_at = now()
  where id = p_placement_id;

  -- Accepting also makes them a member there, so they can keep their entry
  -- and its board up to date. A Root can change the type afterwards.
  if p_accept then
    perform private.join_tree(v_row.tree_id, v_uid, 'member', v_row.placed_by);
  end if;
  perform set_config('ancestree.privileged_profile_write', '', true);

  select name into v_tree_name from public.trees where id = v_row.tree_id;
  perform private.notify(
    v_row.placed_by, v_uid,
    case when p_accept then 'placement_accepted' else 'placement_declined' end,
    v_row.person_id, null,
    coalesce(private.person_label(v_row.person_id), 'A relative')
      || case when p_accept then ' accepted a place on ' else ' declined a place on ' end
      || coalesce(v_tree_name, 'your tree') || '.',
    v_row.tree_id
  );
end;
$$;

revoke all on function public.respond_to_placement(uuid, boolean) from anon, public;
grant execute on function public.respond_to_placement(uuid, boolean) to authenticated, service_role;

-- A person moves their home; a Root of the current home may move an
-- unclaimed entry. The new home must already show them.
create or replace function public.set_home_tree(p_person uuid, p_tree uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_home uuid := private.home_tree(p_person);
  v_owner uuid := private.person_owner_member(p_person);
  v_old public.tree_placements;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if v_home is null then
    raise exception 'That entry no longer exists';
  end if;
  if v_home = p_tree then
    return;
  end if;
  if not (v_owner = v_uid or (v_owner is null and private.is_root_of(v_home))) then
    raise exception 'Only this person, or a Root of their home tree for an unclaimed entry, can move their home'
      using errcode = '42501';
  end if;
  if not private.is_placed(p_tree, p_person) then
    raise exception 'The new home must already show this person' using errcode = '23514';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.people set tree_id = p_tree where id = p_person;
  -- Deployed canvas compatibility: `people.pos_*` follow the new home card.
  select * into v_old from public.tree_placements where tree_id = p_tree and person_id = p_person;
  perform set_config('ancestree.position_mirror', 'on', true);
  update public.people
  set pos_x = v_old.pos_x, pos_y = v_old.pos_y, pos_dx = v_old.pos_dx, pos_dy = v_old.pos_dy
  where id = p_person;
  perform set_config('ancestree.position_mirror', '', true);
  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.set_home_tree(uuid, uuid) from anon, public;
grant execute on function public.set_home_tree(uuid, uuid) to authenticated, service_role;

-- Change a member's account type in one tree.
create or replace function public.set_member_role(p_tree uuid, p_user uuid, p_role text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text;
begin
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can change account types' using errcode = '42501';
  end if;
  if p_role not in ('admin', 'branch_admin', 'member', 'leaf') then
    raise exception 'Unknown account type: %', p_role;
  end if;
  -- The guard raises ROOT_IS_PERMANENT for a Root being demoted.
  update public.tree_members set role = p_role
  where tree_id = p_tree and user_id = p_user
  returning role into v_role;
  if v_role is null then
    raise exception 'That member is not on this tree';
  end if;
  return v_role;
end;
$$;

revoke all on function public.set_member_role(uuid, uuid, text) from anon, public;
grant execute on function public.set_member_role(uuid, uuid, text) to authenticated, service_role;

-- Remove a member from one tree. What they created or own whose home is this
-- tree passes to the acting Root. Their last membership gone, the profile
-- goes too (the caller then removes the auth user).
create or replace function public.remove_tree_member(p_tree uuid, p_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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

  update public.people set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.people set owner_user_id = v_root where owner_user_id = p_user_id and tree_id = p_tree;
  update public.relationships set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.entry_comments set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.documents set uploaded_by = v_root where uploaded_by = p_user_id and tree_id = p_tree;
  update public.invites set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.share_links set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pets set created_by = v_root where created_by = p_user_id and tree_id = p_tree;
  update public.pet_companions pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;
  update public.pet_comments pc set created_by = v_root
    from public.pets pt where pt.id = pc.pet_id and pc.created_by = p_user_id and pt.tree_id = p_tree;
  update public.tree_placements set placed_by = v_root where placed_by = p_user_id and tree_id = p_tree;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  delete from public.tree_members where tree_id = p_tree and user_id = p_user_id;
  perform set_config('ancestree.privileged_profile_write', '', true);

  select not exists (select 1 from public.tree_members where user_id = p_user_id) into v_last;
  if v_last then
    -- Anything left elsewhere (nothing, if every home was this tree) is
    -- reassigned by the caller before the auth user goes.
    update public.people set created_by = v_root where created_by = p_user_id;
    update public.people set owner_user_id = v_root where owner_user_id = p_user_id;
    update public.relationships set created_by = v_root where created_by = p_user_id;
    update public.entry_comments set created_by = v_root where created_by = p_user_id;
    update public.documents set uploaded_by = v_root where uploaded_by = p_user_id;
    update public.invites set created_by = v_root where created_by = p_user_id;
    update public.share_links set created_by = v_root where created_by = p_user_id;
    update public.pets set created_by = v_root where created_by = p_user_id;
    update public.pet_companions set created_by = v_root where created_by = p_user_id;
    update public.pet_comments set created_by = v_root where created_by = p_user_id;
    update public.trees set created_by = null where created_by = p_user_id;
    delete from public.profiles where auth_user_id = p_user_id;
  end if;
  return v_last;
end;
$$;

revoke all on function public.remove_tree_member(uuid, uuid) from anon, public;
grant execute on function public.remove_tree_member(uuid, uuid) to authenticated, service_role;

-- Compatibility wrapper for the deployed /admin.
create or replace function public.admin_delete_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.remove_tree_member(private.current_tree_id(), p_user_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 14. RPCs — signing up, per tree
-- ---------------------------------------------------------------------------
-- Allowlisted first sign-in still bootstraps the first tree.
create or replace function public.ensure_profile(p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_profile public.profiles;
  v_tree_id uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  v_email := private.current_email();
  if not exists (
    select 1 from private.admin_allowlist a where lower(a.email) = lower(v_email)
  ) then
    raise exception 'needs_invite' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  v_tree_id := private.current_tree_id();
  if v_tree_id is null then
    insert into public.trees (name, slug, created_by)
    values ('Family Tree', 'family-tree', v_uid)
    returning id into v_tree_id;
  end if;

  insert into public.profiles (auth_user_id, display_name, role)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    'admin'
  )
  returning * into v_profile;

  perform private.join_tree(v_tree_id, v_uid, 'admin', null);
  return v_profile;
end;
$$;

-- Redeeming: a profile if there is none, a membership in the invite's tree
-- (or, for a founder invite, a brand-new tree with the redeemer as Root).
-- Returns the profile; the tree joined is in `redeem_invite_tree`.
create or replace function public.redeem_invite(p_token text, p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite public.invites;
  v_profile public.profiles;
  v_tree public.trees;
  v_name text;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();
  v_name := coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1));

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if not found then
    insert into public.profiles (auth_user_id, display_name, role, invited_by_user_id)
    values (v_uid, v_name, v_invite.joins_as, v_invite.created_by)
    returning * into v_profile;
  end if;

  if v_invite.founds_tree then
    if exists (select 1 from public.trees t where t.created_by = v_uid) then
      raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
    end if;
    v_tree := private.found_tree_for(v_uid, v_name || '’s tree');
  else
    perform private.join_tree(v_invite.tree_id, v_uid, v_invite.joins_as, v_invite.created_by);
    select * into v_tree from public.trees where id = v_invite.tree_id;
  end if;

  -- Keep the invite's vouch for its entry before the invite goes.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;
  end if;

  -- Remember where this sign-in should land.
  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return v_profile;
end;
$$;

-- Redeem and say which tree was joined (the app calls this one).
create or replace function public.redeem_invite_tree(p_token text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_tree public.trees;
begin
  v_profile := public.redeem_invite(p_token, p_display_name);
  select * into v_tree from public.trees
  where id = nullif(current_setting('ancestree.redeemed_tree', true), '')::uuid;
  return jsonb_build_object(
    'tree_id', v_tree.id, 'tree_slug', v_tree.slug, 'tree_name', v_tree.name,
    'self_person_id', v_profile.self_person_id
  );
end;
$$;

revoke all on function public.redeem_invite_tree(text, text) from anon, public;
grant execute on function public.redeem_invite_tree(text, text) to authenticated, service_role;

drop function if exists public.invite_preview(text);
create function public.invite_preview(p_token text)
returns table (
  valid boolean,
  inviter_name text,
  tree_name text,
  claim_person_name text,
  joins_as text,
  founds_tree boolean
)
language sql
security definer
set search_path = ''
as $$
  select
    true as valid,
    coalesce(p.display_name, 'A family member') as inviter_name,
    t.name as tree_name,
    case
      when pe.id is null then null
      else btrim(
        coalesce(nullif(btrim(pe.preferred_name), ''), coalesce(pe.first_name, ''))
        || ' ' || pe.last_name
      )
    end as claim_person_name,
    i.joins_as,
    i.founds_tree
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and i.archived_at is null
    and (i.expires_at is null or i.expires_at > now());
$$;

-- The one pre-auth RPC: the accept page reads it before sign-in.
revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 15. RPCs — growing a tree
-- ---------------------------------------------------------------------------
-- `existing:` references must be placed on the tree being grown.
create or replace function private.resolve_person_ref(p_ref text, p_new_ids uuid[], p_tree uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_idx int;
  v_id uuid;
begin
  if p_ref is null then
    raise exception 'Missing relationship endpoint';
  end if;

  if p_ref like 'new:%' then
    v_idx := substring(p_ref from 5)::int;
    if v_idx < 0 or v_idx >= coalesce(array_length(p_new_ids, 1), 0) then
      raise exception 'Invalid new-person reference: %', p_ref;
    end if;
    return p_new_ids[v_idx + 1];
  elsif p_ref like 'existing:%' then
    v_id := substring(p_ref from 10)::uuid;
    if not private.is_placed(p_tree, v_id) then
      raise exception 'That person is not on this tree';
    end if;
    return v_id;
  end if;

  raise exception 'Invalid reference: %', p_ref;
end;
$$;

-- The parent/child loop and partner-parent checks, over the lines a tree shows.
create or replace function private.assert_tree_consistent(p_tree uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cycle boolean;
begin
  with recursive walk as (
    select r.from_person as root, r.to_person as node, 1 as depth
    from public.relationships r
    where r.type = 'parent'
      and private.is_placed(p_tree, r.from_person) and private.is_placed(p_tree, r.to_person)
    union all
    select w.root, r.to_person, w.depth + 1
    from walk w
    join public.relationships r on r.from_person = w.node and r.type = 'parent'
    where w.depth < 500 and w.root <> w.node
      and private.is_placed(p_tree, r.to_person)
  )
  select exists (select 1 from walk where root = node) into v_cycle;
  if v_cycle then
    raise exception 'That connection would create a parent/child loop' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.relationships p
    join public.relationships s
      on s.type = 'spouse'
     and least(s.from_person, s.to_person) = least(p.from_person, p.to_person)
     and greatest(s.from_person, s.to_person) = greatest(p.from_person, p.to_person)
    where p.type = 'parent'
      and private.is_placed(p_tree, p.from_person) and private.is_placed(p_tree, p.to_person)
  ) then
    raise exception 'Two people cannot be both partners and parent and child' using errcode = '23514';
  end if;
end;
$$;

drop function if exists public.add_people_with_connections(jsonb, jsonb, integer, jsonb);
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

revoke all on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid) from anon, public;
grant execute on function public.add_people_with_connections(jsonb, jsonb, integer, jsonb, uuid)
  to authenticated, service_role;

drop function if exists public.connect_people(uuid, uuid, text, date, boolean, date);
create or replace function public.connect_people(
  p_from uuid,
  p_to uuid,
  p_type text,
  p_marriage_date date default null,
  p_is_divorced boolean default false,
  p_divorce_date date default null,
  p_tree uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
  v_directed boolean := (p_type = 'parent');
  v_a uuid;
  v_b uuid;
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_type is null or p_type not in ('parent', 'spouse', 'sibling') then
    raise exception 'Unknown relationship type: %', coalesce(p_type, '(null)');
  end if;
  if p_from = p_to then
    raise exception 'A person cannot connect to themselves' using errcode = '23514';
  end if;

  -- The tree being worked on, else any tree the caller belongs to that shows
  -- both people.
  v_tree := coalesce(
    p_tree,
    (select pl.tree_id
     from public.tree_placements pl
     join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
     where pl.person_id = p_from and pl.status = 'active'
       and private.is_placed(pl.tree_id, p_to)
     order by (pl.tree_id = private.home_tree(p_from)) desc
     limit 1)
  );
  if v_tree is null or not private.can_connect_on(v_tree, p_from, p_to) then
    raise exception 'Those two are not both on a tree you can draw on' using errcode = '42501';
  end if;

  v_a := case when v_directed then p_from else least(p_from, p_to) end;
  v_b := case when v_directed then p_to else greatest(p_from, p_to) end;

  if exists (
    select 1 from public.relationships r
    where r.type <> p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
  ) then
    raise exception 'Those two are already connected another way' using errcode = '23514';
  end if;

  insert into public.relationships (
    tree_id, from_person, to_person, type, created_by, marriage_date, is_divorced, divorce_date
  )
  values (
    v_tree, v_a, v_b, p_type, v_uid,
    case when p_type = 'spouse' then p_marriage_date end,
    case when p_type = 'spouse' then coalesce(p_is_divorced, false) else false end,
    case when p_type = 'spouse' and coalesce(p_is_divorced, false) then p_divorce_date end
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    select r.id into v_id
    from public.relationships r
    where r.type = p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b);
  end if;

  if v_directed then
    perform private.assert_tree_consistent(v_tree);
  end if;

  return v_id;
end;
$$;

revoke all on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid) from anon, public;
grant execute on function public.connect_people(uuid, uuid, text, date, boolean, date, uuid)
  to authenticated, service_role;

create or replace function public.resolve_implied_connection(
  p_subject uuid, p_related uuid, p_type text, p_source text, p_resolution text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
  v_a uuid;
  v_b uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_resolution not in ('accepted', 'dismissed') then
    raise exception 'Unknown resolution: %', p_resolution;
  end if;
  if p_type not in ('spouse', 'parent', 'sibling_check', 'duplicate_check') then
    raise exception 'Unknown suggestion type: %', p_type;
  end if;
  if p_source not in ('co_parent', 'unlinked_spouse_child', 'sibling_implied_parent', 'shared_neighbours', 'name_dob_match') then
    raise exception 'Unknown suggestion source: %', p_source;
  end if;
  if p_subject = p_related then
    raise exception 'A suggestion cannot link a person to themselves';
  end if;

  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_subject and pl.status = 'active' and private.is_placed(pl.tree_id, p_related)
  order by (pl.tree_id = private.home_tree(p_subject)) desc
  limit 1;
  if v_tree is null then
    raise exception 'Those two entries are not both on a tree you belong to' using errcode = '42501';
  end if;

  insert into public.connection_suggestions (
    tree_id, subject_person_id, related_person_id, suggested_type, source,
    status, created_by, resolved_by, resolved_at
  ) values (
    v_tree,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check') then least(p_subject, p_related) else p_subject end,
    case when p_type in ('spouse', 'sibling_check', 'duplicate_check') then greatest(p_subject, p_related) else p_related end,
    p_type, p_source, p_resolution, v_uid, v_uid, now()
  )
  on conflict on constraint connection_suggestions_unique_key do nothing;

  if p_resolution <> 'accepted' or p_type not in ('spouse', 'parent') then
    return;
  end if;
  if not private.can_connect_on(v_tree, p_subject, p_related) then
    raise exception 'You can''t draw lines on this tree' using errcode = '42501';
  end if;

  v_a := p_subject;
  v_b := p_related;

  insert into public.relationships (tree_id, from_person, to_person, type, created_by)
  values (
    v_tree,
    case when p_type = 'spouse' then least(v_a, v_b) else v_a end,
    case when p_type = 'spouse' then greatest(v_a, v_b) else v_b end,
    p_type, v_uid
  )
  on conflict do nothing;

  perform private.assert_tree_consistent(v_tree);
end;
$$;

create or replace function public.resolve_connection_suggestion(p_id uuid, p_resolution text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.connection_suggestions;
  v_a uuid;
  v_b uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_resolution not in ('accepted', 'dismissed', 'pending') then
    raise exception 'Unknown resolution: %', p_resolution;
  end if;

  select * into v_row from public.connection_suggestions where id = p_id;
  if not found then
    raise exception 'Suggestion not found';
  end if;
  if not (private.is_root_of(v_row.tree_id) or v_row.created_by = v_uid) then
    raise exception 'Only the suggestion''s author or a Root can resolve it' using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This suggestion was already resolved';
  end if;

  update public.connection_suggestions
     set status = p_resolution,
         resolved_by = case when p_resolution = 'pending' then null else v_uid end,
         resolved_at = case when p_resolution = 'pending' then null else now() end
   where id = p_id;

  if p_resolution = 'accepted' and v_row.suggested_type in ('spouse', 'parent') then
    v_a := v_row.subject_person_id;
    v_b := v_row.related_person_id;
    if not private.can_connect_on(v_row.tree_id, v_a, v_b) then
      raise exception 'You can''t draw lines on this tree' using errcode = '42501';
    end if;

    insert into public.relationships (tree_id, from_person, to_person, type, created_by)
    values (
      v_row.tree_id,
      case when v_row.suggested_type = 'spouse' then least(v_a, v_b) else v_a end,
      case when v_row.suggested_type = 'spouse' then greatest(v_a, v_b) else v_b end,
      v_row.suggested_type, v_uid
    )
    on conflict do nothing;

    perform private.assert_tree_consistent(v_row.tree_id);
  end if;
end;
$$;

drop function if exists public.my_growth_rights();
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
    'can_add', v_role is not null and (v_role <> 'leaf' or v_self is null),
    'is_married_in', v_role is distinct from 'admin' and v_self is not null and v_gate and not v_blood,
    'gate_active', v_gate,
    'self_person_id', v_self,
    'onboarding', v_self is null or not private.is_placed(v_tree, v_self)
  );
end;
$$;

revoke all on function public.my_growth_rights(uuid) from anon, public;
grant execute on function public.my_growth_rights(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 16. RPCs — claiming, per tree
-- ---------------------------------------------------------------------------
drop function if exists public.search_self_candidates(text, text);
create or replace function public.search_self_candidates(
  p_first text, p_last text, p_tree uuid default null
)
returns table (
  id uuid,
  first_name text,
  preferred_name text,
  last_name text,
  maiden_name text,
  date_of_birth date,
  date_of_death date,
  is_deceased boolean,
  city_of_birth text,
  country_of_birth text,
  parent_names text,
  score real
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  if private.fold_name(p_last) is null then
    return;
  end if;

  return query
  select
    pe.id, pe.first_name, pe.preferred_name, pe.last_name, pe.maiden_name,
    pe.date_of_birth, pe.date_of_death, pe.is_deceased, pe.city_of_birth, pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
    ) as parent_names,
    private.self_candidate_score(pe.id, p_first, p_last) as score
  from public.people pe
  where private.is_placed(v_tree, pe.id)
    and private.self_candidate_score(pe.id, p_first, p_last) is not null
    and private.person_is_claimable(pe.id)
    and not exists (
      select 1 from public.claims c
      where c.person_id = pe.id and c.claimant_user_id = v_uid and c.status = 'disputed'
    )
  order by score desc, pe.date_of_birth asc nulls last
  limit 10;
end;
$$;

revoke all on function public.search_self_candidates(text, text, uuid) from anon, public;
grant execute on function public.search_self_candidates(text, text, uuid) to authenticated, service_role;

drop function if exists public.claim_person_as_self(uuid, text, text);
create or replace function public.claim_person_as_self(
  p_person_id uuid, p_first text, p_last text, p_tree uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_self uuid;
  v_creator uuid;
  v_recent int;
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if not found then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if v_self is not null then
    raise exception 'You already have your own entry' using errcode = '23505';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  select created_by into v_creator from public.people where id = p_person_id;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;
  if not private.is_placed(v_tree, p_person_id) then
    raise exception 'That entry is on a different tree';
  end if;
  if not private.person_is_claimable(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  if private.self_candidate_score(p_person_id, p_first, p_last) is null then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  update public.people set owner_user_id = v_uid where id = p_person_id;
  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;

  -- A founding Root claiming their entry anchors their tree's bloodline.
  if private.is_root_of(v_tree) then
    insert into public.bloodline_anchors (tree_id, person_id, created_by)
    values (v_tree, p_person_id, v_uid)
    on conflict do nothing;
  end if;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative joining the tree. If this looks wrong, you can dispute it.',
    v_tree
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

revoke all on function public.claim_person_as_self(uuid, text, text, uuid) from anon, public;
grant execute on function public.claim_person_as_self(uuid, text, text, uuid) to authenticated, service_role;

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
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  select created_by into v_creator from public.people where id = p_person_id;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;

  -- Both entries must sit on one tree the claimant belongs to.
  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_person_id and pl.status = 'active' and private.is_placed(pl.tree_id, v_self)
  limit 1;
  if v_tree is null then
    raise exception 'That entry is on a different tree';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (nullif(btrim(s.first_name), '') is not null
       and lower(btrim(s.first_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      or
      (nullif(btrim(s.preferred_name), '') is not null
       and lower(btrim(s.preferred_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) and not private.person_invited_to_claim(p_person_id) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  -- Move the placeholder's lines onto the claimed entry, dropping any that
  -- would double up or point at itself.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
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

  update public.documents set person_id = p_person_id where person_id = v_self;
  update public.entry_comments set person_id = p_person_id where person_id = v_self;
  -- The placeholder's placements come along where the claimed entry has none.
  insert into public.tree_placements (tree_id, person_id, status, placed_by, responded_at)
  select pl.tree_id, p_person_id, pl.status, pl.placed_by, pl.responded_at
  from public.tree_placements pl
  where pl.person_id = v_self
  on conflict (tree_id, person_id) do nothing;
  update public.people tgt
  set photo_path = stub.photo_path
  from public.people stub
  where tgt.id = p_person_id and stub.id = v_self
    and tgt.photo_path is null and stub.photo_path is not null;

  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;
  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.',
    v_tree
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

create or replace function public.person_claim_candidates()
returns setof public.people
language sql
security definer
set search_path = ''
as $$
  with me as (
    select self.*
    from public.profiles p
    join public.people self on self.id = p.self_person_id
    where p.auth_user_id = (select auth.uid())
  ),
  unclaimed as (
    select distinct pe.*
    from public.people pe
    join public.tree_placements pl on pl.person_id = pe.id and pl.status = 'active'
    join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = (select auth.uid())
    cross join me
    where pe.id <> me.id
      and private.is_placed(pl.tree_id, me.id)
      and pe.owner_user_id = pe.created_by
      and not exists (select 1 from public.profiles p where p.self_person_id = pe.id)
      and not exists (
        select 1 from public.claims c where c.person_id = pe.id and c.status = 'approved'
      )
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.claimant_user_id = (select auth.uid()) and c.status = 'disputed'
      )
  )
  select u.*
  from unclaimed u, me
  where
    (
      lower(btrim(u.last_name)) = lower(btrim(me.last_name))
      and (
        (nullif(btrim(me.first_name), '') is not null
         and lower(btrim(me.first_name)) in (
           lower(btrim(coalesce(u.first_name, ''))), lower(btrim(coalesce(u.preferred_name, '')))))
        or
        (nullif(btrim(me.preferred_name), '') is not null
         and lower(btrim(me.preferred_name)) in (
           lower(btrim(coalesce(u.first_name, ''))), lower(btrim(coalesce(u.preferred_name, '')))))
      )
    )
    or private.person_invited_to_claim(u.id);
$$;

create or replace function public.dispute_claim(p_claim_id uuid, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_creator uuid;
  v_claimant uuid;
  v_status text;
  v_root uuid;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by, pe.tree_id
    into v_person, v_claimant, v_status, v_creator, v_tree
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = p_claim_id;

  if v_person is null then
    raise exception 'That claim no longer exists';
  end if;
  if v_creator is distinct from v_uid then
    raise exception 'Only the person who created this entry can dispute the claim' using errcode = '42501';
  end if;
  if v_status <> 'approved' then
    raise exception 'This claim is not open to dispute';
  end if;

  update public.claims
  set status = 'disputed', dispute_reason = nullif(btrim(p_reason), ''),
      resolved_at = null, resolved_by = null
  where id = p_claim_id;

  perform private.notify(
    v_claimant, v_uid, 'claim_disputed', v_person, p_claim_id,
    'Your claim on ' || private.person_label(v_person) || ' was disputed and is now with a Root.',
    v_tree
  );

  for v_root in
    select user_id from public.tree_members where tree_id = v_tree and role = 'admin'
  loop
    perform private.notify(
      v_root, v_uid, 'claim_disputed', v_person, p_claim_id,
      'A claim on ' || private.person_label(v_person) || ' is disputed and needs a Root''s decision.',
      v_tree
    );
  end loop;
end;
$$;

create or replace function public.resolve_claim(p_claim_id uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_creator uuid;
  v_claimant uuid;
  v_status text;
  v_tree uuid;
begin
  if p_action not in ('uphold', 'reverse') then
    raise exception 'Unknown action: %', p_action;
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by, pe.tree_id
    into v_person, v_claimant, v_status, v_creator, v_tree
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = p_claim_id;

  if v_person is null then
    raise exception 'That claim no longer exists';
  end if;
  if not private.is_root_of(v_tree) then
    raise exception 'Roots only' using errcode = '42501';
  end if;
  if v_status <> 'disputed' then
    raise exception 'Only a disputed claim can be resolved';
  end if;

  if p_action = 'uphold' then
    update public.claims set status = 'approved', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;

    perform private.notify(
      v_claimant, v_uid, 'claim_upheld', v_person, p_claim_id,
      'A Root upheld your claim on ' || private.person_label(v_person) || '.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_upheld', v_person, p_claim_id,
      'A Root upheld the claim on ' || private.person_label(v_person) || '.', v_tree
    );
  else
    update public.claims set status = 'rejected', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;
    update public.people set owner_user_id = created_by where id = v_person;
    update public.profiles set self_person_id = null
    where auth_user_id = v_claimant and self_person_id = v_person;

    perform private.notify(
      v_claimant, v_uid, 'claim_reversed', v_person, p_claim_id,
      'A Root reversed your claim on ' || private.person_label(v_person)
        || '. Re-add your own entry from onboarding if needed.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_reversed', v_person, p_claim_id,
      'A Root reversed the claim on ' || private.person_label(v_person)
        || '. You have edit rights again.', v_tree
    );
  end if;
end;
$$;

create or replace function public.resolve_entry_flag(p_comment_id uuid, p_resolved boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_author uuid;
  v_is_flag boolean;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select person_id, created_by, is_flag, tree_id
    into v_person, v_author, v_is_flag, v_tree
  from public.entry_comments where id = p_comment_id;

  if v_person is null then
    raise exception 'That comment no longer exists';
  end if;
  if not v_is_flag then
    raise exception 'Only flags can be resolved';
  end if;
  if v_uid <> v_author
     and not private.is_root_of(v_tree)
     and not private.can_edit_person(v_person) then
    raise exception 'Only the entry owner, a Root, or the person who raised the flag can resolve it'
      using errcode = '42501';
  end if;

  update public.entry_comments
  set status = case when p_resolved then 'resolved' else 'open' end,
      resolved_at = case when p_resolved then now() else null end,
      resolved_by = case when p_resolved then v_uid else null end
  where id = p_comment_id;
end;
$$;

create or replace function public.set_entry_verified(p_person_id uuid, p_verified boolean default true)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_owner uuid;
  v_creator uuid;
  v_tree uuid;
  v_label text;
begin
  select owner_user_id, created_by, tree_id into v_owner, v_creator, v_tree
  from public.people where id = p_person_id;
  if v_owner is null then
    raise exception 'That entry no longer exists';
  end if;
  if not private.is_root_of(v_tree) then
    raise exception 'Roots only' using errcode = '42501';
  end if;

  update public.people
  set verified_at = case when p_verified then now() else null end,
      verified_by = case when p_verified then v_uid else null end
  where id = p_person_id;

  if not p_verified then
    return;
  end if;

  v_label := private.person_label(p_person_id);
  perform private.notify(
    v_owner, v_uid, 'entry_verified', p_person_id, null,
    v_label || ' was marked verified by a Root.', v_tree
  );
  if v_creator is distinct from v_owner then
    perform private.notify(
      v_creator, v_uid, 'entry_verified', p_person_id, null,
      v_label || ' was marked verified by a Root.', v_tree
    );
  end if;
end;
$$;

create or replace function public.revert_entry_edit(p_revision_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rev public.entry_revisions%rowtype;
  v_current jsonb;
  v_patch jsonb := '{}';
  v_fields text[] := '{}';
  v_field text;
  v_cols text;
  v_label text;
  v_tree uuid;
begin
  select * into v_rev from public.entry_revisions where id = p_revision_id for update;
  if not found then
    raise exception 'REVISION_NOT_FOUND';
  end if;
  v_tree := private.home_tree(v_rev.person_id);
  if not private.is_root_of(v_tree) then
    raise exception 'Only a Root can undo an edit.' using errcode = '42501';
  end if;
  if v_rev.reverted_at is not null then
    raise exception 'ALREADY_REVERTED';
  end if;

  select to_jsonb(pe) into v_current from public.people pe where pe.id = v_rev.person_id;

  for v_field in select jsonb_object_keys(v_rev.before) loop
    continue when not v_field = any (private.revision_fields());
    if v_current -> v_field is not distinct from v_rev.after -> v_field then
      v_patch := v_patch || jsonb_build_object(v_field, v_rev.before -> v_field);
      v_fields := v_fields || v_field;
    end if;
  end loop;

  if array_length(v_fields, 1) is null then
    raise exception 'NOTHING_TO_REVERT';
  end if;

  select string_agg(format('%I', f), ', ') into v_cols from unnest(v_fields) f;
  execute format(
    'update public.people set (%1$s) = (select %1$s from jsonb_populate_record(null::public.people, $1)) where id = $2',
    v_cols
  ) using v_patch, v_rev.person_id;

  update public.entry_revisions
  set reverted_at = now(), reverted_by = (select auth.uid())
  where id = p_revision_id;

  v_label := private.person_label(v_rev.person_id);
  perform private.notify(
    v_rev.editor_user_id, (select auth.uid()), 'edit_reverted', v_rev.person_id, null,
    coalesce(private.member_label((select auth.uid())), 'A Root')
      || ' undid your change to ' || coalesce(v_label, 'an entry') || '.',
    v_tree
  );

  return v_fields;
end;
$$;

-- ---------------------------------------------------------------------------
-- 17. Seeing across trees (Step 25.4 data path; UI later)
-- ---------------------------------------------------------------------------
create table public.tree_visibility (
  tree_id uuid not null references public.trees (id) on delete cascade,
  viewer_tree_id uuid not null references public.trees (id) on delete cascade,
  granted_by uuid references public.profiles (auth_user_id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (tree_id, viewer_tree_id),
  constraint tree_visibility_distinct check (tree_id <> viewer_tree_id)
);

alter table public.tree_visibility enable row level security;
create policy tree_visibility_select on public.tree_visibility for select to authenticated
  using ((select private.is_tree_member(tree_id)) or (select private.is_tree_member(viewer_tree_id)));
-- A Root opens their tree to another tree they belong to.
create policy tree_visibility_insert on public.tree_visibility for insert to authenticated
  with check (
    (select private.is_root_of(tree_id))
    and (select private.is_tree_member(viewer_tree_id))
    and granted_by = (select auth.uid())
  );
create policy tree_visibility_delete on public.tree_visibility for delete to authenticated
  using ((select private.is_root_of(tree_id)));
revoke all on table public.tree_visibility from anon, public;
grant select, insert, delete on table public.tree_visibility to authenticated;
grant all on table public.tree_visibility to service_role;

-- Only a Root, the person, or the home tree's Roots flip visitor hiding.
-- (`hidden_from_visitors` sits on people, under `can_edit_person`.)
