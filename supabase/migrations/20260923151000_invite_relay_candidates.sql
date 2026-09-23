-- Step 41.1 — A relayed invite can claim the newcomer's entry
--
-- Request access sends someone to "Ask a relative who's on ancestree" (Step
-- 30.5) when it finds no strong name match, often because they're on the
-- tree under another spelling: a married surname, a nickname. The relative's
-- invite was a plain one, so onboarding's search could miss them again. Now
-- the relative's "Relatives Asking for an Invite" card lists the entries on
-- the tree they picked that the newcomer's name matches, and can send a
-- claim invite for one (`sendClaimInvite`): accepting it claims the entry and
-- opens the canvas on it (Step 30.2), with no onboarding.
--
-- `invite_relay_candidates(relay, tree)` — who an ask's name matches on one
-- tree, modelled on `invite_request_candidates` (Step 30.3): onboarding's
-- scoring (`private.self_candidate_score`; null is no match) and details,
-- living entries placed on the tree that nobody is behind yet, best five.
-- Only the member the ask went to may ask, only while it's waiting, and only
-- of a tree they're a member of, where they see every entry already, so
-- nothing new is revealed. Nobody who has died is listed (Step 37), nor an
-- entry someone has claimed, and only entries the member may send a claim
-- invite for (`private.can_invite_to_claim`: a Root anywhere, a Branch on
-- their side, a Leaf on what they added), so a Leaf without that right sees
-- the plain invite alone. `sendRelayedClaimInvite` asks again before the
-- invite names an entry.

create or replace function public.invite_relay_candidates(p_relay uuid, p_tree uuid)
returns table (
  id uuid,
  first_name text,
  preferred_name text,
  last_name text,
  maiden_name text,
  date_of_birth date,
  date_of_death date,
  is_deceased boolean,
  city_of_birth text,
  country_of_birth text,
  parent_names text,
  score real
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_relay public.invite_relays;
begin
  select * into v_relay
  from public.invite_relays r
  where r.id = p_relay and r.recipient_user_id = (select auth.uid());
  -- One refusal whether the ask is gone or someone else's, so it says
  -- nothing about asks the caller can't see.
  if not found then
    raise exception 'Only the member an ask went to can see who it matches'
      using errcode = '42501';
  end if;
  if not private.is_tree_member(p_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  -- Only an ask still waiting has an invite left to send.
  if v_relay.status <> 'pending' then
    return;
  end if;

  return query
  with candidates as materialized (
    select
      pe.id as person_id,
      private.self_candidate_score(pe.id, v_relay.first_name, v_relay.last_name) as name_score
    from public.tree_placements pl
    join public.people pe on pe.id = pl.person_id
    where pl.tree_id = p_tree
      and pl.status = 'active'
      -- Nobody who has died is anyone's own entry (Step 37).
      and pe.is_deceased is not true
      and pe.date_of_death is null
      and private.person_is_claimable(pe.id)
  )
  select
    pe.id, pe.first_name, pe.preferred_name, pe.last_name, pe.maiden_name,
    pe.date_of_birth, pe.date_of_death, pe.is_deceased, pe.city_of_birth, pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
    ) as parent_names,
    ca.name_score as score
  from candidates ca
  join public.people pe on pe.id = ca.person_id
  where ca.name_score is not null
    -- Theirs to hand over, asked as the member: the right a claim invite
    -- needs anyway, so what's listed is what they can send.
    and private.can_invite_to_claim(pe.id)
  -- As onboarding orders them, then by id, so asking again gives the same five.
  order by ca.name_score desc, pe.date_of_birth asc nulls last, pe.id
  limit 5;
end;
$$;

revoke all on function public.invite_relay_candidates(uuid, uuid) from anon, public;
grant execute on function public.invite_relay_candidates(uuid, uuid) to authenticated;
