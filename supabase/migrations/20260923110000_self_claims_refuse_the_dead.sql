-- Step 37 — Onboarding never offers or accepts someone who has died as "you"
--
-- Step 36 stopped the canvas's "Is one of these you?" card
-- (`person_claim_candidates`) and its "This is me" (`claim_person`) offering
-- or claiming anyone marked as having died or given a death date.
-- Onboarding's find-yourself search didn't follow: `search_self_candidates`
-- listed every unclaimed entry the typed name matched, the dead included,
-- and `claim_person_as_self` → `private.claim_as_self` made the one picked
-- the newcomer's own entry. Nothing was deleted on that path (a newcomer has
-- no entry yet), but a newcomer named after a late grandparent was offered
-- the grandparent, and "This is me" made them the grandparent. Since Step
-- 30.7 the search runs as onboarding opens, with nothing typed.
--
-- 1. `search_self_candidates` — lists nobody who has died, vouched or not.
--    A vouched entry still comes first.
-- 2. `private.claim_as_self` — refuses an entry of someone who has died,
--    with `claim_person`'s message. It makes onboarding's claim and a claim
--    invite's claim on accepting (`redeem_invite`, Step 30.2); a refusal
--    there already leaves them joined, for onboarding to take from there.
-- 3. `private.can_invite_to_claim` — refuses a death date as well as the
--    flag, as the checks above do, so neither a claim invite nor a request
--    approved as a claim (Step 30.3) can name such an entry.
--
-- The live bodies of all three were checked against 20260923070000 and
-- 20260923080500 first (md5 identical).

-- ---------------------------------------------------------------------------
-- 1. The search lists nobody who has died
-- ---------------------------------------------------------------------------
create or replace function public.search_self_candidates(
  p_first text, p_last text, p_tree uuid default null
)
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
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_named boolean := private.fold_name(p_last) is not null;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      pe.id as person_id,
      private.person_invited_to_claim(pe.id) as vouched,
      case when v_named then private.self_candidate_score(pe.id, p_first, p_last) end as name_score
    from public.people pe
    where private.is_placed(v_tree, pe.id)
      -- Nobody who has died is anyone's own entry, vouched or not (Step 37).
      and pe.is_deceased is not true
      and pe.date_of_death is null
      and private.person_is_claimable(pe.id)
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.claimant_user_id = v_uid and c.status = 'disputed'
      )
  )
  select
    pe.id, pe.first_name, pe.preferred_name, pe.last_name, pe.maiden_name,
    pe.date_of_birth, pe.date_of_death, pe.is_deceased, pe.city_of_birth, pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
    ) as parent_names,
    case when ca.vouched then 1::real else ca.name_score end as score
  from candidates ca
  join public.people pe on pe.id = ca.person_id
  where ca.vouched or ca.name_score is not null
  order by ca.vouched desc, score desc, pe.date_of_birth asc nulls last
  limit 10;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. The claim refuses someone who has died
-- ---------------------------------------------------------------------------
create or replace function private.claim_as_self(
  p_person uuid, p_tree uuid, p_name_ok boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_creator uuid;
  v_died boolean;
  v_recent int;
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if not found then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if v_self is not null then
    raise exception 'You already have your own entry' using errcode = '23505';
  end if;
  if not private.is_tree_member(p_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  select created_by, is_deceased or date_of_death is not null
    into v_creator, v_died
  from public.people where id = p_person;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;
  if not private.is_placed(p_tree, p_person) then
    raise exception 'That entry is on a different tree';
  end if;
  -- Someone who has died is nobody's own entry (Step 37, as `claim_person`).
  if v_died then
    raise exception 'That entry is marked as having died' using errcode = '42501';
  end if;
  if not private.person_is_claimable(p_person) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  if not coalesce(p_name_ok, false) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  update public.people set owner_user_id = v_uid where id = p_person;
  update public.profiles set self_person_id = p_person where auth_user_id = v_uid;

  -- A founding Root claiming their entry anchors their tree's bloodline.
  if private.is_root_of(p_tree) then
    insert into public.bloodline_anchors (tree_id, person_id, created_by)
    values (p_tree, p_person, v_uid)
    on conflict do nothing;
  end if;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person, v_claim_id,
    private.person_label(p_person)
      || ' was claimed by a relative joining the tree. If this looks wrong, you can dispute it.',
    p_tree
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Nobody is invited to claim someone given a death date
-- ---------------------------------------------------------------------------
create or replace function private.can_invite_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.role_in(h.tree) in ('admin', 'branch_admin', 'member')
    and private.can_edit_person(p_person_id)
    and not private.person_is_claimed(p_person_id)
    and exists (
      select 1 from public.people pe
      where pe.id = p_person_id and pe.owner_user_id = pe.created_by
        and not pe.is_deceased and pe.date_of_death is null
    )
    and not exists (select 1 from public.profiles p where p.self_person_id = p_person_id),
    false
  )
  from h;
$$;
