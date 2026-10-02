-- Step 98.2 follow-up: a parent fills in their placeholder child from anywhere.
--
-- A placeholder child sits on the tree it was added to, under its parent's
-- entry, but its parent may not be a member there: their entry was brought
-- over from their own tree and their yes hasn't come, they declined it, or
-- they were removed from that tree. They were told about it, and the edit
-- rights already follow the parent (`can_edit_person`), but they couldn't
-- read it — every read asks for a tree they belong to — so they couldn't
-- open it or save to it. Now their own placeholder child, and a child of
-- theirs they've filled in (it's theirs then), is readable to them wherever
-- it is, with its photo:
--   * `private.can_see_own_child(person)`: the caller's own entry is drawn as
--     its parent, and it's a placeholder or the caller owns it;
--   * `people_select` and `storage_photos_select` take it alongside
--     `can_see_person`, which is left as it is, so bringing people over from
--     another tree (`place_people`, `placement_preview`) still asks for a tree
--     the Root belongs to;
--   * `public.is_own_child(person)`: whether the caller's own entry is drawn
--     as this person's parent, for the edit page to ask.

create or replace function private.can_see_own_child(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_own_child(p_person)
    and exists (
      select 1 from public.people pe
      where pe.id = p_person
        and (pe.placeholder_number is not null
             or pe.owner_user_id = (select auth.uid()))
    );
$$;

-- Read by the policies below as the member, as `can_see_person` is.
revoke all on function private.can_see_own_child(uuid) from public, anon;
grant execute on function private.can_see_own_child(uuid) to authenticated;

create or replace function public.is_own_child(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_own_child(p_person);
$$;

revoke all on function public.is_own_child(uuid) from public, anon;
grant execute on function public.is_own_child(uuid) to authenticated;

alter policy people_select on public.people
  using (
    (select private.can_see_person(people.id))
    or (select private.can_see_own_child(people.id))
  );

alter policy storage_photos_select on storage.objects
  using (
    bucket_id = 'photos'
    and (
      (select private.can_see_person(private.uuid_or_null((storage.foldername(objects.name))[2])))
      or (select private.can_see_own_child(private.uuid_or_null((storage.foldername(objects.name))[2])))
      or (
        (storage.foldername(name))[2] = 'pets'
        and (select private.is_tree_member(private.uuid_or_null((storage.foldername(objects.name))[1])))
      )
    )
  );
