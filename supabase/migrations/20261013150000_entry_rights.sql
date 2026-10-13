-- Step 148.2: what the member may do with some entries' details, as the
-- database decides it, for the phone's scribe to offer each detail a story
-- tells the way they could make it on the web.
--
-- The scribe finds details about people on the tree in a story (when and
-- where someone was born or died) and the member accepts each one, or not.
-- Accepted, a detail is an edit where they may edit the entry
-- (`private.can_edit_person`, which the `people_update` policy asks); filled
-- in where they may only fill in its blanks (`private.can_fill_person`, Step
-- 44, through `fill_person_blanks`); else a suggestion to whoever can
-- (`suggest_entry_change`, Step 67), made from a tree of theirs that shows
-- the entry in full, its home tree first. The web works this out from the
-- member's role and branches (`lib/entry-access.server.ts`); the phone has
-- no cookie session to do that with, so it asks here. Every write is
-- checked again as it's made.
--
-- One new function; nothing else changes. Only entries the member could do
-- something with come back: ones they may edit, or that a tree of theirs
-- shows in full.

create or replace function public.entry_rights(p_people uuid[])
returns table (person_id uuid, can_edit boolean, can_fill boolean, suggest_tree uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with asked as (
    select distinct x as id
    from unnest(coalesce(p_people, '{}'::uuid[])) as x
    where x is not null
  ),
  rights as (
    select a.id,
      private.can_edit_person(a.id) as edit,
      (
        select pl.tree_id
        from public.tree_placements pl
        where pl.person_id = a.id
          and pl.status = 'active'
          and pl.detail = 'full'
          and private.is_tree_member(pl.tree_id)
        order by (pl.tree_id = private.home_tree(a.id)) desc, pl.tree_id
        limit 1
      ) as tree
    from (select id from asked limit 500) a
  )
  select r.id,
    r.edit,
    not r.edit and private.can_fill_person(r.id),
    case when not r.edit then r.tree end
  from rights r
  where r.edit or r.tree is not null;
$$;

revoke all on function public.entry_rights(uuid[]) from public, anon;
grant execute on function public.entry_rights(uuid[]) to authenticated, service_role;
