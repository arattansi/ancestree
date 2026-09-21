-- Step 22.1 — Branches and Canopy invite someone to claim an entry
--
-- Inviting someone to claim a particular entry was a Root's alone (Step 18.2):
-- the invite names the entry, and whoever redeems it may claim that entry
-- without the name match. That is a lot to hand out, so it was handed to
-- nobody else. It left the common case to the Roots: a Branch or a Canopy
-- member adds their cousin, has the cousin's address, and has to ask a Root to
-- send the link.
--
-- The rule now follows the reach each account type already has. You may invite
-- someone to claim an entry you could edit, while nobody is behind it yet:
--
--   Root     any entry, joining as Canopy or Leaf
--   Branch   an entry on the side they tend, or one they added — as a Leaf
--   Canopy   an entry they added — as a Leaf
--   Leaf     none
--
-- Nothing wider than a Leaf comes in without a Root: they can promote the
-- newcomer from /admin afterwards.
--
-- The per-member invite grant (`profiles.can_invite`) goes with this. It was
-- how a Root let a Canopy member invite at all; now every Branch and Canopy
-- member invites Leaves, a Root invites Canopy or Leaf, and a Leaf never
-- invites. This migration stops reading the column; the next one drops it,
-- once the app no longer selects it.

-- ---------------------------------------------------------------------------
-- Who may mint an invite that joins as `p_joins_as`
-- ---------------------------------------------------------------------------

create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      -- A Branch or a Canopy member brings relatives in as Leaves.
      p_joins_as = 'leaf'
      and private.is_tree_member(p_tree_id)
      and exists (
        select 1
        from public.profiles p
        where p.auth_user_id = (select auth.uid())
          and p.role in ('branch_admin', 'member')
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Whose entry the acting user may invite someone to claim
-- ---------------------------------------------------------------------------

-- An entry they could edit, that nobody is behind yet: the owner never moved
-- away from whoever created it, no claim stuck, and it is no member's own.
-- Nor anyone who has died: there is nobody to send that link to.
-- `can_edit_person` is what draws the reach — everything for a Root, their
-- side or their own additions for a Branch, their own additions for Canopy —
-- so a change to a Branch's reach carries here with no change of its own.
create or replace function private.can_invite_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not private.is_leaf()
    and private.can_edit_person(p_person_id)
    and not private.person_is_claimed(p_person_id)
    and exists (
      select 1
      from public.people pe
      where pe.id = p_person_id
        and pe.owner_user_id = pe.created_by
        and not pe.is_deceased
    )
    and not exists (
      select 1
      from public.profiles p
      where p.self_person_id = p_person_id
    );
$$;

grant execute on function private.can_invite_to_claim(uuid) to authenticated, service_role;

-- The app asks before it mints: a claim invite is bound to an address, which
-- only the service role may do for a non-Root (`invites_guard`), so the row is
-- written past RLS and this is the check that stands in for it.
create or replace function public.can_invite_to_claim(p_person_id uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select private.can_invite_to_claim(p_person_id);
$$;

revoke all on function public.can_invite_to_claim(uuid) from public, anon;
grant execute on function public.can_invite_to_claim(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- invites_guard: a claim invite from anyone but a Root is scoped, and joins as a Leaf
-- ---------------------------------------------------------------------------

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  -- Roots, and server-side writes with no signed-in user (the service role).
  if (select auth.uid()) is null or private.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Clearing `person_id` is allowed: it is how the entry's deletion reaches
    -- here (on delete set null), and it can only narrow the invite.
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null
           and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
    -- Clearing the address only turns it back into a bare link.
    if new.invited_email is not null
       and new.invited_email is distinct from old.invited_email then
      raise exception 'Only a Root can change who an invite signs in'
        using errcode = '42501';
    end if;
  else
    if new.person_id is not null
       and not (
         new.joins_as = 'leaf'
         and private.can_invite_to_claim(new.person_id)
       ) then
      raise exception 'You can invite someone to claim only an unclaimed entry you can edit, and only as a Leaf'
        using errcode = '42501';
    end if;
    if new.invited_email is not null then
      raise exception 'Only a Root can bind an invite to an email address'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$function$;
