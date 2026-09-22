-- Step 22.3: Branch and Canopy may delete an unclaimed entry they created,
-- as long as nobody else has built on it. A Root still deletes anything.
--
-- "Built on" means anything another member hung on the entry: a connection
-- they drew, a comment or flag, a document, a companion that lives with it,
-- or a claim of any status. Any of those and the entry is the family's now —
-- only a Root removes it. A Leaf deletes nothing, and nobody deletes their
-- own entry or another member's this way.

create or replace function private.can_delete_person(p_person_id uuid)
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
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1
        from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (
        select 1 from public.claims c where c.person_id = p_person_id
      )
      and not exists (
        select 1
        from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1
        from public.entry_comments ec
        where ec.person_id = p_person_id
          and ec.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1
        from public.documents d
        where d.person_id = p_person_id
          and d.uploaded_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1
        from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id
          and pt.created_by is distinct from (select auth.uid())
      )
    );
$$;

grant execute on function private.can_delete_person(uuid) to authenticated, service_role;

-- Asked by the delete action before it tries, so a refusal can say why
-- instead of RLS quietly deleting nothing.
create or replace function public.can_delete_person(p_person_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_delete_person(p_person_id);
$$;

revoke all on function public.can_delete_person(uuid) from public, anon;
grant execute on function public.can_delete_person(uuid) to authenticated, service_role;

drop policy if exists people_delete on public.people;
create policy people_delete on public.people
  for delete to authenticated
  using ((select private.can_delete_person(people.id)));
