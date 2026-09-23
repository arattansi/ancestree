-- Step 39 — A tree has at most two Roots, and each Root makes up to four
-- Branches
--
-- Until now a Root could make any number of Roots and Branches. From here:
--
-- * A tree has at most two Roots. A Root is still for good
--   (`ROOT_IS_PERMANENT`), so a place only opens when a Root deletes their
--   account.
-- * Each Root makes up to four Branches on a tree, counted by who made them
--   one — so one Root can't spend another's four. Leaves are unlimited, and
--   so are members: this limits who holds Root and Branch, nothing else.
--
-- A limit only stops a new promotion. Nobody is ever demoted by one, and a
-- Root who inherits a departing Root's Branches may hold more than four; they
-- just can't make another until they're under.
--
-- 1. `private.roots_per_tree` / `private.branches_per_root` — the numbers,
--    once for the database. `lib/account-types.ts` mirrors them for the UI.
-- 2. `tree_members.branch_granted_by` — the Root who made them a Branch. Set
--    by the database, never chosen: whoever makes the change, whenever
--    someone becomes a Branch; cleared whenever they stop being one. Only the
--    service role names someone else, to hand a departing Root's Branches to
--    their successor (`deleteAccount`), and a link to a deleted profile
--    clears itself.
-- 3. Backfill: each Branch today is credited to the Root who invited them,
--    if a Root of that tree did, else to the tree's longest-standing Root.
--    On live that is one Branch (Arzu), credited to Aalim, who invited her.
-- 4. `private.tree_members_limits` — a trigger beside `tree_members_guard`
--    that records the Root and refuses a third Root (`ROOT_LIMIT`) or a
--    fifth Branch (`BRANCH_LIMIT`). It runs for every caller, the RPCs and
--    the service role included, since a Root can also write roles straight
--    through the API. It locks the tree's row before counting, so two Roots
--    promoting at once are counted one after the other.
--    `tree_members_guard` is unchanged: only a Root makes a Branch, and a
--    Root's profile is only ever deleted by the service role
--    (`deleteAccount`), which the guard already lets through.
-- 5. `ensure_profile` — the original co-admin allowlist makes whoever signs
--    in afresh a Root of the first tree. With two Roots there already, they
--    join it as a Leaf instead of failing to sign in.
-- 6. `member_directory` — says who made each Branch one, for the admin
--    console.
--
-- Checked first: the live body of `ensure_profile` matches
-- 20260923050000 (md5 identical).
-- Live, no tree is over either limit: the Family Tree has two Roots and one
-- Branch; The White Family has one Root.

-- ---------------------------------------------------------------------------
-- 1. The limits
-- ---------------------------------------------------------------------------
create or replace function private.roots_per_tree()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 2;
$$;

create or replace function private.branches_per_root()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 4;
$$;

comment on function private.roots_per_tree() is
  'Step 39: the most Roots a tree can have. Mirrored as ROOTS_PER_TREE in lib/account-types.ts.';
comment on function private.branches_per_root() is
  'Step 39: the most Branches one Root can make on a tree. Mirrored as BRANCHES_PER_ROOT in lib/account-types.ts.';

-- ---------------------------------------------------------------------------
-- 2. Who made them a Branch
-- ---------------------------------------------------------------------------
alter table public.tree_members
  add column branch_granted_by uuid
    references public.profiles (auth_user_id) on delete set null;

comment on column public.tree_members.branch_granted_by is
  'Step 39: the Root who made this member a Branch, whose four they count toward. Set by tree_members_limits; null unless role = branch_admin.';

create index tree_members_branch_granted_by_idx
  on public.tree_members (branch_granted_by);

-- ---------------------------------------------------------------------------
-- 3. Credit today's Branches (before the trigger exists, as postgres)
-- ---------------------------------------------------------------------------
update public.tree_members b
set branch_granted_by = coalesce(
  (select r.user_id from public.tree_members r
   where r.tree_id = b.tree_id and r.role = 'admin'
     and r.user_id = b.invited_by_user_id),
  (select r.user_id from public.tree_members r
   where r.tree_id = b.tree_id and r.role = 'admin'
   order by r.created_at, r.user_id
   limit 1)
)
where b.role = 'branch_admin' and b.branch_granted_by is null;

alter table public.tree_members
  add constraint tree_members_branch_granted_by_check
    check (branch_granted_by is null or role = 'branch_admin');

-- ---------------------------------------------------------------------------
-- 4. Record the Root, and hold the limits
-- ---------------------------------------------------------------------------
create or replace function private.tree_members_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  -- Who made them a Branch is recorded, never chosen: the member making the
  -- change (a Root, by tree_members_guard) whenever someone becomes one.
  -- Without a signed-in user (the service role, handing a departing Root's
  -- Branches on) the value given stands. A link to a deleted profile clears
  -- itself (on delete set null).
  if new.role is distinct from 'branch_admin' then
    new.branch_granted_by := null;
  elsif v_uid is not null then
    if tg_op = 'INSERT' or old.role is distinct from 'branch_admin' then
      new.branch_granted_by := v_uid;
    elsif new.branch_granted_by is distinct from old.branch_granted_by
          and exists (select 1 from public.profiles p
                      where p.auth_user_id = old.branch_granted_by) then
      new.branch_granted_by := old.branch_granted_by;
    end if;
  end if;

  -- At most two Roots a tree. The tree's row is locked before counting, so
  -- two Roots promoting at once are counted one after the other.
  if new.role = 'admin' and (tg_op = 'INSERT' or old.role is distinct from 'admin') then
    perform 1 from public.trees t where t.id = new.tree_id for no key update;
    if (select count(*) from public.tree_members m
        where m.tree_id = new.tree_id and m.role = 'admin'
          and m.user_id <> new.user_id) >= private.roots_per_tree() then
      raise exception 'ROOT_LIMIT: a tree has at most % Roots', private.roots_per_tree()
        using errcode = '23514';
    end if;
  end if;

  -- Four Branches a Root, counted by who made them one. Only a new Branch
  -- is stopped: Branches handed on from a departing Root can take their
  -- successor past four.
  if new.role = 'branch_admin' and new.branch_granted_by is not null
     and (tg_op = 'INSERT' or old.role is distinct from 'branch_admin') then
    perform 1 from public.trees t where t.id = new.tree_id for no key update;
    if (select count(*) from public.tree_members m
        where m.tree_id = new.tree_id and m.role = 'branch_admin'
          and m.branch_granted_by = new.branch_granted_by
          and m.user_id <> new.user_id) >= private.branches_per_root() then
      raise exception 'BRANCH_LIMIT: a Root makes at most % Branches on a tree',
        private.branches_per_root()
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

-- After tree_members_guard (triggers fire in name order), so only a change
-- the guard allowed is counted.
create trigger tree_members_limits
  before insert or update on public.tree_members
  for each row execute function private.tree_members_limits();

-- ---------------------------------------------------------------------------
-- 5. The co-admin allowlist joins as a Leaf once the tree has its two Roots
-- ---------------------------------------------------------------------------
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
    values ('Family', 'family', v_uid)
    returning id into v_tree_id;
  end if;

  insert into public.profiles (auth_user_id, display_name)
  values (v_uid, coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)))
  returning * into v_profile;

  -- A Root of the first tree, while it has room for one (Step 39); a Leaf
  -- once it has its two.
  perform private.join_tree(
    v_tree_id,
    v_uid,
    case
      when (select count(*) from public.tree_members m
            where m.tree_id = v_tree_id and m.role = 'admin') < private.roots_per_tree()
      then 'admin'
      else 'member'
    end,
    null
  );
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. The directory says who made each Branch one
-- ---------------------------------------------------------------------------
create or replace view public.member_directory
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
  p.self_person_id,
  m.branch_granted_by,
  granter.display_name as branch_granted_by_name
from public.tree_members m
join public.profiles p on p.auth_user_id = m.user_id
left join public.profiles inviter on inviter.auth_user_id = m.invited_by_user_id
left join public.profiles granter on granter.auth_user_id = m.branch_granted_by;
