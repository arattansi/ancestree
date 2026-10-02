-- Step 106 follow-up: the trees a member's own card is on, by name, with
-- what each shows. Making a card name only can take them off that tree, and
-- `trees` then hides its name from them, so Your Entry lost the row it had
-- to undo it from. Only the caller's own entry, as `placement_asks` already
-- names those trees to them.
create or replace function public.own_card_trees()
returns table (tree_id uuid, tree_name text, approval text)
language sql
stable
security definer
set search_path = ''
as $$
  select pl.tree_id, t.name, pl.approval
  from public.tree_placements pl
  join public.trees t on t.id = pl.tree_id
  where (select auth.uid()) is not null
    and pl.person_id = private.self_person_id()
    and pl.status = 'active'
  order by t.name;
$$;

revoke all on function public.own_card_trees() from public, anon;
grant execute on function public.own_card_trees() to authenticated, service_role;
