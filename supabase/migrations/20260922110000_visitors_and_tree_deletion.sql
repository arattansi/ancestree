-- Step 25.4 — Seeing across trees, and deleting a tree
--
-- A Root may open their tree, read-only, to the members of another tree
-- they belong to (`tree_visibility`, laid down in 25.1). This migration lets
-- those *visitors* read it: the tree row, its placements, and the people on
-- it — except entries marked `hidden_from_visitors`, which a visitor never
-- reads (the canvas draws a blurred card from the placement alone).
--
-- Also: `delete_tree`, which moves every entry whose home the tree was to
-- another tree that shows them before the row goes, and a slug that drops
-- apostrophes rather than turning "Ferial’s tree" into "ferial-s-tree".

-- ---------------------------------------------------------------------------
-- 1. Slugs without possessive stubs
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
        regexp_replace(
          regexp_replace(lower(coalesce(p_text, '')), '[''’]', '', 'g'),
          '[^a-z0-9]+', '-', 'g'
        ),
        '(^-+|-+$)', '', 'g'
      ),
      '-'
    ),
    ''
  );
$$;

-- ---------------------------------------------------------------------------
-- 2. Visitors
-- ---------------------------------------------------------------------------
-- A member of a tree this tree has been opened to.
create or replace function private.is_visitor_of(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_visibility v
    join public.tree_members m on m.tree_id = v.viewer_tree_id
    where v.tree_id = p_tree and m.user_id = (select auth.uid())
  );
$$;

-- Member or visitor: may read the tree and where its cards sit.
create or replace function private.can_view_tree(p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_tree_member(p_tree) or private.is_visitor_of(p_tree);
$$;

-- A person's details: shown on a tree the caller belongs to, or on a tree
-- they visit unless the person is hidden from visitors.
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
  )
  or exists (
    select 1
    from public.tree_placements pl
    join public.people pe on pe.id = pl.person_id
    where pl.person_id = p_person
      and pl.status = 'active'
      and not pe.hidden_from_visitors
      and private.is_visitor_of(pl.tree_id)
  );
$$;

-- A line: both ends shown on one tree the caller belongs to or visits. (A
-- hidden person's lines still draw to a blurred card.)
create or replace function private.can_see_edge(p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_placements a
    join public.tree_placements b
      on b.tree_id = a.tree_id and b.person_id = p_to and b.status = 'active'
    where a.person_id = p_from and a.status = 'active'
      and private.can_view_tree(a.tree_id)
  );
$$;

grant execute on function
  private.is_visitor_of(uuid), private.can_view_tree(uuid), private.can_see_edge(uuid, uuid)
  to authenticated, service_role;

drop policy if exists trees_select on public.trees;
create policy trees_select on public.trees for select to authenticated
  using ((select private.can_view_tree(id)));

drop policy if exists tree_placements_select on public.tree_placements;
create policy tree_placements_select on public.tree_placements for select to authenticated
  using (
    (select private.can_view_tree(tree_id))
    or person_id = (select private.self_person_id())
  );

drop policy if exists relationships_select on public.relationships;
create policy relationships_select on public.relationships for select to authenticated
  using ((select private.can_see_edge(from_person, to_person)));

-- Visitors see who runs the tree they're looking at (names on cards need the
-- directory), nothing more.
drop policy if exists tree_members_select on public.tree_members;
create policy tree_members_select on public.tree_members for select to authenticated
  using ((select private.can_view_tree(tree_id)));

drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (
    auth_user_id = (select auth.uid())
    or exists (
      select 1
      from public.tree_members theirs
      where theirs.user_id = profiles.auth_user_id
        and private.can_view_tree(theirs.tree_id)
    )
  );

-- The tree views: a hidden person's row survives for a visitor as the
-- placement alone (every person column null), which is what a blurred card
-- is drawn from.
create or replace view public.tree_people
with (security_invoker = true) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  (pe.tree_id = pl.tree_id) as is_home,
  pl.person_id as id,
  pe.tree_id as home_tree_id,
  pe.first_name,
  pe.middle_name,
  pe.preferred_name,
  pe.maiden_name,
  pe.last_name,
  pe.date_of_birth,
  pe.date_of_death,
  pe.date_of_birth_precision,
  pe.date_of_death_precision,
  pe.city_of_birth,
  pe.country_of_birth,
  pe.place_id_birth,
  pe.place_id_death,
  pe.is_deceased,
  pe.place_of_death,
  pe.sex,
  pe.lineage_type,
  pe.photo_path,
  pe.photo_crop,
  pe.owner_user_id,
  pe.created_by,
  pe.verified_at,
  pe.hidden_from_visitors,
  pe.created_at,
  pe.updated_at,
  (pe.id is null) as blurred
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

grant select on public.tree_people to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. Deleting a tree
-- ---------------------------------------------------------------------------
-- A Root deletes a tree they run. Every entry whose home it was moves home
-- to another tree that shows them (the one they were placed on first); an
-- entry shown nowhere else goes with the tree, as do its boards, banks,
-- companions, invites and links.
create or replace function public.delete_tree(p_tree uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_moved int := 0;
  v_gone int := 0;
  v_row record;
  v_new_home uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can delete a tree' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_row in
    select pe.id from public.people pe where pe.tree_id = p_tree
  loop
    select pl.tree_id into v_new_home
    from public.tree_placements pl
    where pl.person_id = v_row.id and pl.tree_id <> p_tree and pl.status = 'active'
    order by pl.created_at asc
    limit 1;

    if v_new_home is not null then
      update public.people set tree_id = v_new_home where id = v_row.id;
      v_moved := v_moved + 1;
    else
      v_gone := v_gone + 1;
    end if;
  end loop;

  -- Their own entry gone with the tree: members start over elsewhere.
  update public.profiles p
  set self_person_id = null
  where p.self_person_id in (select id from public.people where tree_id = p_tree);

  delete from public.trees where id = p_tree;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return jsonb_build_object('moved', v_moved, 'deleted', v_gone);
end;
$$;

revoke all on function public.delete_tree(uuid) from anon, public;
grant execute on function public.delete_tree(uuid) to authenticated, service_role;

-- With the RPC in place, nothing deletes a tree row directly.
drop policy if exists trees_delete on public.trees;
