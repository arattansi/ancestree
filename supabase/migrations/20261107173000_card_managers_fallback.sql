-- Step 227: a birthday card nobody could start gets someone who can (found
-- in Step 224, 2026-11-07). Lucan is the only Root of his own tree, his
-- parents and siblings have no account, and on one tree `card_managers` had
-- no fallback past the Roots, a tending Branch and a spouse or parent who's a
-- member, never the person themself: so nobody, while Elizabeth, his
-- parent's cousin and the tree's other member, would be reminded to sign.
--
-- Aalim's calls: when no spouse, parent, Root or Branch can manage a card,
-- their sibling or child members do, on one tree as on several; and when
-- there's still nobody, anyone reminded to sign (`card_reminder_members`,
-- members whose My Family Tree shows them). Whoever it falls to manages it
-- in full, as any manager does.
--
-- `private.card_managers` re-created from 20261030090000_birthday_cards (the
-- live body is asserted first). Everyone who had a manager keeps the same
-- ones: the fallbacks only come in where there was nobody.

do $$
begin
  if (select md5(prosrc) from pg_proc where oid = 'private.card_managers(uuid)'::regprocedure)
      <> 'a8ec58e0d960d73febc9ecb326ceb361' then
    raise exception 'card_managers changed since 20261030090000_birthday_cards';
  end if;
end;
$$;

-- The members who manage someone's card: start it, see and remove every
-- signature before the day, delete it. Never the person themself.
create or replace function private.card_managers(p_person uuid)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_owner uuid := private.person_owner_member(p_person);
  v_home uuid;
  v_trees integer;
  v_close uuid[];
  v_out uuid[];
begin
  select p.tree_id into v_home from public.people p where p.id = p_person;
  if v_home is null then
    return;
  end if;
  select count(*) into v_trees
  from public.tree_placements pl
  where pl.person_id = p_person and pl.status = 'active' and pl.detail = 'full';

  -- Their spouse (a marriage not ended, to someone living) and parents, as
  -- members.
  v_close := array(
    select distinct s.u from (
      select private.person_owner_member(o.id) as u
      from public.relationships r
      join public.people o
        on o.id = case when r.from_person = p_person then r.to_person else r.from_person end
      where r.type = 'spouse' and not r.is_divorced
        and p_person in (r.from_person, r.to_person)
        and not o.is_deceased and o.date_of_death is null
      union all
      select private.person_owner_member(r.from_person)
      from public.relationships r
      where r.type = 'parent' and r.to_person = p_person
    ) s
    where s.u is not null and s.u is distinct from v_owner
  );

  if v_trees <= 1 then
    -- On one tree: its Roots, the Branch who tends them, spouse and parents.
    v_out := array(
      select distinct x.u from (
        select m.user_id as u
        from public.tree_members m
        where m.tree_id = v_home and m.role = 'admin'
        union all
        select m.user_id
        from public.tree_members m
        join public.profiles pr on pr.auth_user_id = m.user_id
        where m.tree_id = v_home and m.role = 'branch_admin'
          and pr.self_person_id is not null
          and private.branch_tends(pr.self_person_id, v_home, p_person)
        union all
        select unnest(v_close)
      ) x
      where x.u is distinct from v_owner
    );
  else
    -- On several trees: only spouse and parents.
    v_out := v_close;
  end if;

  -- No spouse, parent, Root or Branch: siblings and children (on several
  -- trees since Step 217; on one too since Step 227).
  if cardinality(v_out) = 0 then
    v_out := array(
      select distinct s.u from (
        select private.person_owner_member(x.id) as u
        from (
          select r2.to_person as id
          from public.relationships r1
          join public.relationships r2
            on r2.from_person = r1.from_person and r2.type = 'parent' and r2.to_person <> p_person
          where r1.type = 'parent' and r1.to_person = p_person
          union
          select case when r.from_person = p_person then r.to_person else r.from_person end
          from public.relationships r
          where r.type = 'sibling' and p_person in (r.from_person, r.to_person)
          union
          select r.to_person
          from public.relationships r
          where r.type = 'parent' and r.from_person = p_person
        ) x
      ) s
      where s.u is not null and s.u is distinct from v_owner
    );
  end if;

  -- On several trees with nobody at all (decision 4): the home tree's Roots.
  if cardinality(v_out) = 0 and v_trees > 1 then
    v_out := array(
      select m.user_id
      from public.tree_members m
      where m.tree_id = v_home and m.role = 'admin' and m.user_id is distinct from v_owner
    );
  end if;

  -- Still nobody (Step 227): whoever is reminded to sign, the members whose
  -- My Family Tree shows them.
  if cardinality(v_out) = 0 then
    v_out := array(
      select distinct r.u
      from private.card_reminder_members(p_person) as r(u)
      where r.u is distinct from v_owner
    );
  end if;

  return query select distinct x.u from unnest(v_out) as x(u);
end;
$$;
