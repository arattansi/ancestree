-- Step 18.4 — Documents are private to an entry's owner, their Branch and Roots
--
-- Until now every member of the tree could list and download every document
-- on every entry (`documents_select` and `storage_documents_select` checked
-- only tree membership). Documents are the most sensitive thing the tree holds
-- — certificates, passports, medical letters — so they now go only to:
--
--   * a Root;
--   * the entry's owner (`owner_user_id`: the member it describes once they
--     have it, otherwise whoever added it), or the member whose own entry it is;
--   * the Branch who tends the side of the tree the entry is on
--     (`private.is_on_own_branch`) — including another member's own entry,
--     which a Branch can't edit but does look after.
--
-- Everyone who can edit an entry (`private.can_edit_person`) is in that list,
-- which matters beyond reading: a DELETE that filters on a column is also held
-- to the SELECT policy, so the people allowed to remove a document must be
-- able to see it.
--
-- Photos are untouched: they are the face on the card, shown to the whole
-- tree.

create or replace function private.can_see_documents(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or p_person_id = private.self_person_id()
    or exists (
      select 1
      from public.people pe
      where pe.id = p_person_id
        and pe.owner_user_id = (select auth.uid())
    )
    or private.is_on_own_branch(p_person_id);
$$;

grant execute on function private.can_see_documents(uuid) to authenticated, service_role;

drop policy documents_select on public.documents;
create policy documents_select on public.documents
  for select to authenticated
  using ((select private.can_see_documents(documents.person_id)));

-- The object path is `{tree_id}/{person_id}/{filename}`.
drop policy storage_documents_select on storage.objects;
create policy storage_documents_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'documents'
    and (select private.can_see_documents(
      private.uuid_or_null((storage.foldername(objects.name))[2])
    ))
  );
