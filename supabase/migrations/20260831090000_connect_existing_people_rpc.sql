-- Step 4.7 — add connections from the edit view
--
-- `add_people_with_connections` can only wire up edges that involve at least one
-- brand-new person. To link two people who are *both* already in the tree (e.g.
-- adding a second parent that was missed when the child was first entered), we
-- need a small dedicated RPC that runs the same guards:
--   * both endpoints in the same tree, caller is a member of it
--   * a pair can't be connected two different ways at once
--   * no directed cycle in the parent edges
--
-- Also adds an explicit 'sibling' edge type. Sibling edges are *not* drawn on
-- the tree (the layout only consumes 'parent' / 'spouse'); they exist purely as
-- a recorded connection that other features can reference later.
--
-- Down:
--   drop function public.connect_people(uuid, uuid, text, date, boolean, date);
--   alter table public.relationships drop constraint relationships_type_check,
--     add constraint relationships_type_check check (type in ('parent','spouse'));

alter table public.relationships
  drop constraint relationships_type_check;
alter table public.relationships
  add constraint relationships_type_check
  check (type in ('parent', 'spouse', 'sibling'));

-- Sibling edges are undirected: store the lower id first and dedupe the pair.
create unique index if not exists relationships_sibling_pair_uidx
  on public.relationships (
    tree_id, least(from_person, to_person), greatest(from_person, to_person)
  )
  where type = 'sibling';

create or replace function public.connect_people(
  p_from uuid,
  p_to uuid,
  p_type text,
  p_marriage_date date default null,
  p_is_divorced boolean default false,
  p_divorce_date date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
  v_to_tree uuid;
  v_directed boolean := (p_type = 'parent');
  v_a uuid;
  v_b uuid;
  v_id uuid;
  v_cycle boolean;
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

  select tree_id into v_tree from public.people where id = p_from;
  select tree_id into v_to_tree from public.people where id = p_to;
  if v_tree is null or v_to_tree is null then
    raise exception 'That person is not in this tree' using errcode = '23514';
  end if;
  if v_tree <> v_to_tree then
    raise exception 'Those people are on different trees' using errcode = '23514';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  -- parent edges are directed (from = parent, to = child); spouse and sibling
  -- edges are undirected and stored with the lower id first.
  v_a := case when v_directed then p_from else least(p_from, p_to) end;
  v_b := case when v_directed then p_to else greatest(p_from, p_to) end;

  -- The same pair can't be connected two different ways.
  if exists (
    select 1 from public.relationships r
    where r.tree_id = v_tree
      and r.type <> p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
  ) then
    raise exception 'Those two are already connected another way'
      using errcode = '23514';
  end if;

  insert into public.relationships (
    tree_id, from_person, to_person, type, created_by,
    marriage_date, is_divorced, divorce_date
  )
  values (
    v_tree, v_a, v_b, p_type, v_uid,
    case when p_type = 'spouse' then p_marriage_date end,
    case when p_type = 'spouse' then coalesce(p_is_divorced, false) else false end,
    case
      when p_type = 'spouse' and coalesce(p_is_divorced, false) then p_divorce_date
    end
  )
  on conflict do nothing
  returning id into v_id;

  if v_id is null then
    -- Edge already existed — return it so the caller can treat this as success.
    select r.id into v_id
    from public.relationships r
    where r.tree_id = v_tree
      and r.type = p_type
      and least(r.from_person, r.to_person) = least(v_a, v_b)
      and greatest(r.from_person, r.to_person) = greatest(v_a, v_b);
  end if;

  -- No directed loop in the parent edges for this tree.
  if v_directed then
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
  end if;

  return v_id;
end;
$$;

revoke all on function public.connect_people(uuid, uuid, text, date, boolean, date)
  from anon, public;
grant execute on function public.connect_people(uuid, uuid, text, date, boolean, date)
  to authenticated, service_role;

drop function if exists public.connect_sibling(uuid, uuid);
