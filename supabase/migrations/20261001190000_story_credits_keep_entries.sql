-- Step 99 follow-up: a credit in someone else's story keeps an entry, as
-- their story about it or their photo of it already does.
--
-- `story_credits` cascades with the person, so before this a Branch or a
-- Leaf deleting an entry they made took its credit out of a story someone
-- else told, with no word. Now that refuses, and the app's existing answer
-- says to ask a Root. A Root, and a placeholder child's parent (Step 98.2),
-- still may. Re-created from 20261001140000 (live md5 checked), with one
-- more condition.

CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    -- A placeholder child's parent (Step 98.2).
    or (private.is_placeholder(p_person_id) and private.is_own_child(p_person_id))
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.stories s
        where s.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      -- Nor credited them in a story of theirs (Step 99): deleting the entry
      -- would take the credit out of someone else's story.
      and not exists (
        select 1 from public.story_credits sc
        join public.stories s on s.id = sc.story_id
        where sc.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;
