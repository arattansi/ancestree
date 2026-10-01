-- Step 98.2 follow-up: a Branch invites the parent too.
--
-- 98.2 offered whoever added a placeholder child an invite for its parent to
-- claim their own entry, but the claim-invite rule only let a Branch invite
-- to an entry they may edit, so a Branch adding a placeholder under someone
-- off their side was refused. Now a Root or a Branch of the tree may invite
-- a placeholder's parent while a placeholder waits under them on that tree:
-- living, not a placeholder themselves, nobody behind the entry
-- (`person_is_claimable`). Re-creates `private.can_invite_to_claim_on`
-- from `20261001170000` with that one branch added.

CREATE OR REPLACE FUNCTION private.can_invite_to_claim_on(p_tree uuid, p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- A placeholder child (Step 98.3): a Root or a Branch of the tree, or
      -- its parent, may invite the child to claim it. It stays a
      -- placeholder until the parent shows it.
      or (
        private.is_placeholder(p_person_id)
        and private.person_is_claimable(p_person_id)
        and private.is_tree_member(p_tree)
        and (
          private.role_in(p_tree) in ('admin', 'branch_admin')
          or private.is_own_child(p_person_id)
        )
      )
      -- A placeholder child's parent (Step 98.2): a Root or a Branch of the
      -- tree may invite them to claim their own entry, to fill it in, while
      -- a placeholder waits under them here and nobody is behind the entry.
      or (
        private.role_in(p_tree) in ('admin', 'branch_admin')
        and not private.is_placeholder(p_person_id)
        and private.person_is_claimable(p_person_id)
        and exists (
          select 1 from public.people pe
          where pe.id = p_person_id
            and not pe.is_deceased and pe.date_of_death is null
        )
        and exists (
          select 1 from public.relationships r
          join public.people c on c.id = r.to_person
          where r.type = 'parent' and r.from_person = p_person_id
            and c.placeholder_number is not null
            and private.is_placed(p_tree, c.id)
        )
      )
    ),
    false
  );
$function$;
