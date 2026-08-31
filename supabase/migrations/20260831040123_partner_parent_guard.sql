-- Stop a pair from being both partners and parent-and-child.
--
-- `add_people_with_connections` already rejects this (guard 4b), but
-- `resolve_connection_suggestion` — which also writes relationship edges when
-- an implied connection is accepted from a person's panel — did not. That let a
-- stray `spouse` edge survive next to an established `parent` edge on the same
-- pair, so the canvas drew two lines between a child and their parent.
--
-- 1. One-time cleanup: drop every `spouse` edge whose pair also has a `parent`
--    edge (the `parent` edge is the source of truth), and dismiss any still
--    pending `spouse` suggestion for such a pair so it can't be re-accepted.
-- 2. Recreate `resolve_connection_suggestion` with the same guard.
--
-- Down: recreate `resolve_connection_suggestion` from migration 20260831010000.

-- 1. Cleanup --------------------------------------------------------------------
delete from public.relationships s
using public.relationships p
where s.type = 'spouse'
  and p.type = 'parent'
  and p.tree_id = s.tree_id
  and least(p.from_person, p.to_person) = least(s.from_person, s.to_person)
  and greatest(p.from_person, p.to_person) = greatest(s.from_person, s.to_person);

update public.connection_suggestions cs
   set status = 'dismissed',
       resolved_at = now()
 where cs.status = 'pending'
   and cs.suggested_type = 'spouse'
   and exists (
     select 1
     from public.relationships p
     where p.type = 'parent'
       and p.tree_id = cs.tree_id
       and least(p.from_person, p.to_person)
           = least(cs.subject_person_id, cs.related_person_id)
       and greatest(p.from_person, p.to_person)
           = greatest(cs.subject_person_id, cs.related_person_id)
   );

-- 2. Guard --------------------------------------------------------------------
create or replace function public.resolve_connection_suggestion(
  p_id uuid,
  p_resolution text
)
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
  v_cycle boolean;
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
  if not (private.is_admin() or v_row.created_by = v_uid) then
    raise exception 'Only the suggestion''s author or an admin can resolve it'
      using errcode = '42501';
  end if;
  if v_row.status <> 'pending' then
    raise exception 'This suggestion was already resolved';
  end if;

  update public.connection_suggestions
     set status = p_resolution,
         resolved_by = case when p_resolution = 'pending' then null else v_uid end,
         resolved_at = case when p_resolution = 'pending' then null else now() end
   where id = p_id;

  if p_resolution = 'accepted'
     and v_row.suggested_type in ('spouse', 'parent') then
    v_a := v_row.subject_person_id;
    v_b := v_row.related_person_id;

    -- A pair cannot be both a spouse pair and a parent-child pair.
    if v_row.suggested_type = 'spouse' and exists (
      select 1 from public.relationships r
      where r.tree_id = v_row.tree_id
        and r.type = 'parent'
        and least(r.from_person, r.to_person) = least(v_a, v_b)
        and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
    ) then
      raise exception 'Two people cannot be both partners and parent and child'
        using errcode = '23514';
    end if;
    if v_row.suggested_type = 'parent' and exists (
      select 1 from public.relationships r
      where r.tree_id = v_row.tree_id
        and r.type = 'spouse'
        and least(r.from_person, r.to_person) = least(v_a, v_b)
        and greatest(r.from_person, r.to_person) = greatest(v_a, v_b)
    ) then
      raise exception 'Two people cannot be both partners and parent and child'
        using errcode = '23514';
    end if;

    insert into public.relationships (tree_id, from_person, to_person, type, created_by)
    values (
      v_row.tree_id,
      case when v_row.suggested_type = 'spouse' then least(v_a, v_b) else v_a end,
      case when v_row.suggested_type = 'spouse' then greatest(v_a, v_b) else v_b end,
      v_row.suggested_type,
      v_uid
    )
    on conflict do nothing;

    with recursive walk as (
      select r.from_person as root, r.to_person as node, 1 as depth
      from public.relationships r
      where r.tree_id = v_row.tree_id and r.type = 'parent'
      union all
      select w.root, r.to_person, w.depth + 1
      from walk w
      join public.relationships r
        on r.from_person = w.node and r.type = 'parent'
       and r.tree_id = v_row.tree_id
      where w.depth < 500 and w.root <> w.node
    )
    select exists (select 1 from walk where root = node) into v_cycle;
    if v_cycle then
      raise exception 'That connection would create a parent/child loop'
        using errcode = '23514';
    end if;
  end if;
end;
$$;

revoke all on function public.resolve_connection_suggestion(uuid, text) from anon, public;
grant execute on function public.resolve_connection_suggestion(uuid, text)
  to authenticated, service_role;
