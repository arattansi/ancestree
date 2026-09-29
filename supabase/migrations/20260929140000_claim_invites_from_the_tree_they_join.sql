-- Step 84 — A Root can invite someone to claim an entry their tree shows
--
-- A claim invite could be sent only by someone who may edit the entry on
-- its home tree (Step 22.1, `private.can_invite_to_claim`). A Root of
-- another tree that shows the entry — brought over as a basic card, or
-- shown in full since (Step 80) — couldn't, so the person it is had to join
-- and find themselves by name (Step 83).
--
-- Now the right is judged on the tree the newcomer joins, which must show
-- the entry:
--
--   * whoever may hand the entry over on its home tree, as before, into a
--     tree they belong to;
--   * a Root of that tree, for any entry on it that nobody is behind yet:
--     the owner never moved from whoever created it, no claim stuck, no
--     member's own, and they are living.
--
-- Accepting is unchanged: `redeem_invite` claims the entry on the invite's
-- tree (`private.claim_as_self`, which since Step 83 takes a basic card and
-- shows it in full from there), whoever added the entry is told and can
-- dispute, and someone who has an entry of their own already is shown
-- beside it (`private.merge_invited_entry` folds in nothing that is on
-- another tree).
--
-- Additive: two new functions. `can_invite_to_claim` stays, for the code
-- that was live when this was applied.

create or replace function private.can_invite_to_claim_on(p_tree uuid, p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    private.is_placed(p_tree, p_person_id)
    and (
      (private.is_tree_member(p_tree) and private.can_invite_to_claim(p_person_id))
      or (
        private.is_root_of(p_tree)
        and private.person_is_claimable(p_person_id)
        and exists (
          select 1 from public.people pe
          where pe.id = p_person_id
            and not pe.is_deceased and pe.date_of_death is null
        )
      )
    ),
    false
  );
$$;

revoke all on function private.can_invite_to_claim_on(uuid, uuid) from public, anon;
grant execute on function private.can_invite_to_claim_on(uuid, uuid) to authenticated, service_role;

-- The app asks before it mints, as it asked `can_invite_to_claim`.
create or replace function public.can_invite_to_claim_on(p_tree uuid, p_person_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_invite_to_claim_on(p_tree, p_person_id);
$$;

revoke all on function public.can_invite_to_claim_on(uuid, uuid) from public, anon;
grant execute on function public.can_invite_to_claim_on(uuid, uuid) to authenticated, service_role;
