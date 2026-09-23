-- Step 30.3 — Approve a request as a claim of the entry it matched
--
-- The home page's "request access" finds a tree by a strong name match on a
-- living, unclaimed entry (`trees_matching_name`), yet once a Root approved
-- the request the newcomer typed their name again at onboarding and searched
-- for that same entry. Now the Root sees, with each pending request, the
-- entries on its tree that the requester's name matches, and can approve the
-- request as one of them: the invite then carries the entry
-- (`invites.person_id`), so accepting it claims the entry (Step 30.2) and
-- lands them on it. `invites_guard` already lets a Root name an entry.
--
-- `invite_request_candidates(request)` — who a pending request's name
-- matches, by onboarding's scoring (`private.self_candidate_score`; null is
-- no match) and with onboarding's details to recognise them by: living
-- entries placed on the request's tree that nobody is behind yet. Only a
-- Root of that tree may ask, and a Root sees the whole tree already, so
-- nothing new is revealed. `approveInviteRequest` asks again before it names
-- an entry on the invite, so an entry that has since been claimed, died or
-- left the tree can't be named.

create or replace function public.invite_request_candidates(p_request uuid)
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
  v_request public.invite_requests;
begin
  select * into v_request from public.invite_requests r where r.id = p_request;
  -- One refusal whether the request is gone or on someone else's tree, so it
  -- says nothing about requests the caller can't see. `is_root_of` is null
  -- off the tree, hence `is not true`.
  if not found or private.is_root_of(v_request.tree_id) is not true then
    raise exception 'Only a Root of its tree can see who a request matches'
      using errcode = '42501';
  end if;
  -- Only a request still waiting has an approval left to make.
  if v_request.status <> 'pending' then
    return;
  end if;

  return query
  with candidates as (
    select
      pe.id as person_id,
      private.self_candidate_score(pe.id, v_request.first_name, v_request.last_name) as name_score
    from public.people pe
    where private.is_placed(v_request.tree_id, pe.id)
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
  -- As onboarding orders them, then by id, so asking again gives the same five.
  order by ca.name_score desc, pe.date_of_birth asc nulls last, pe.id
  limit 5;
end;
$$;

revoke all on function public.invite_request_candidates(uuid) from anon, public;
grant execute on function public.invite_request_candidates(uuid) to authenticated;
