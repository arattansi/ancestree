-- Step 30.2 — Accepting a claim invite claims the entry
--
-- A claim invite (`invites.person_id`) left only a vouch behind
-- (`private.claim_vouches`), and only the canvas's `claim_person` and its
-- candidate list read it. Onboarding's `search_self_candidates` and
-- `claim_person_as_self` didn't, so a newcomer whose name doesn't match the
-- entry — a married surname, a nickname, the very case the vouch was built
-- for — was told "We couldn't find you", filled in the whole add-yourself
-- form (a throwaway entry, and a "was added" notice to every Root), then
-- claimed the entry again from the canvas, which merged the throwaway in.
--
-- 1. `private.claim_as_self` — the claim itself, out of
--    `claim_person_as_self`: every check (no entry of their own yet, a
--    member of the tree, the entry on it and nobody's, the daily limit) and
--    every effect (ownership, the self link, an approved claim, a Root's
--    bloodline anchor, and the notice that lets the entry's creator dispute
--    it). Whether the name matters is the caller's to say.
-- 2. `redeem_invite` — someone with no entry of their own who accepts a
--    claim invite claims its entry there and then, the invite's vouch
--    standing in for the name match, and a new profile is named after the
--    entry rather than the email. If the entry has meanwhile gone to someone
--    else, been deleted or left the tree, they still join and find or add
--    themselves on onboarding as before. A member who already has an entry
--    keeps just the vouch; ordinary and founder invites are untouched.
-- 3. `redeem_invite_tree` — also says whether their own entry is on the tree
--    they joined (`self_placed`), so the app can open the canvas on it.
-- 4. `search_self_candidates` / `claim_person_as_self` — honour a vouch as
--    the canvas does, for anyone who reaches onboarding holding one: the
--    entry is listed first whatever its name score, and claims without the
--    name match.
--
-- The live bodies of the four re-created functions were checked against
-- 20260923050000 (`redeem_invite`) and 20260922090000 (the other three)
-- first.

-- ---------------------------------------------------------------------------
-- 1. The claim itself
-- ---------------------------------------------------------------------------
-- `p_name_ok` is the one check that differs by caller: onboarding passes
-- whether the typed name matches (or a vouch waives it); a claim invite
-- passes true, since the invite is the vouch. It raises on anything else
-- amiss, with the messages the app already maps.
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

  select created_by into v_creator from public.people where id = p_person;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;
  if not private.is_placed(p_tree, p_person) then
    raise exception 'That entry is on a different tree';
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

-- It can waive the name match, so only the SECURITY DEFINER RPCs below call it.
revoke all on function private.claim_as_self(uuid, uuid, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Redeeming a claim invite claims its entry
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite(p_token text, p_display_name text default null)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_invite public.invites;
  v_profile public.profiles;
  v_tree public.trees;
  v_name text;
  v_new_profile boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();
  v_name := coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1));

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if not found then
    insert into public.profiles (auth_user_id, display_name, invited_by_user_id)
    values (v_uid, v_name, v_invite.created_by)
    returning * into v_profile;
    v_new_profile := true;
  end if;

  if v_invite.founds_tree then
    if exists (select 1 from public.trees t where t.created_by = v_uid) then
      raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
    end if;
    v_tree := private.found_tree_for(v_uid, private.default_tree_name(v_uid));
  else
    perform private.join_tree(v_invite.tree_id, v_uid, v_invite.joins_as, v_invite.created_by);
    select * into v_tree from public.trees where id = v_invite.tree_id;
  end if;

  -- A claim invite (never a founder invite: `invites_guard`). Its vouch for
  -- the entry outlives the invite.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;

    -- Someone with no entry of their own claims it here (Step 30.2), the
    -- vouch standing in for the name match. Anything that stops the claim —
    -- the entry claimed by someone else, deleted or off this tree, the daily
    -- limit — leaves them joined, for onboarding to take from there. A member
    -- who has an entry keeps the vouch for the canvas's "This is me".
    if v_profile.self_person_id is null then
      begin
        perform private.claim_as_self(v_invite.person_id, v_tree.id, true);
        -- Named after the entry, not the email, when the invite carried no name.
        if v_new_profile and nullif(btrim(p_display_name), '') is null then
          update public.profiles
          set display_name = coalesce(nullif(private.person_label(v_invite.person_id), ''), display_name)
          where auth_user_id = v_uid;
        end if;
      exception when others then
        null;
      end;
    end if;
  end if;

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  delete from public.invite_requests where invite_id = v_invite.id;
  delete from public.invites where id = v_invite.id;

  perform set_config('ancestree.privileged_profile_write', '', true);

  -- Read afresh: a claim above set `self_person_id` and perhaps the name.
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Say whether their own entry is on the tree they joined
-- ---------------------------------------------------------------------------
create or replace function public.redeem_invite_tree(p_token text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
  v_tree public.trees;
begin
  v_profile := public.redeem_invite(p_token, p_display_name);
  select * into v_tree from public.trees
  where id = nullif(current_setting('ancestree.redeemed_tree', true), '')::uuid;
  return jsonb_build_object(
    'tree_id', v_tree.id, 'tree_slug', v_tree.slug, 'tree_name', v_tree.name,
    'self_person_id', v_profile.self_person_id,
    -- Claimed on the way in (Step 30.2), or there already: the app opens the
    -- canvas on it rather than onboarding.
    'self_placed', private.is_placed(v_tree.id, v_profile.self_person_id)
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Onboarding honours a vouch
-- ---------------------------------------------------------------------------
-- The entry an invite named for them comes first, whatever the typed name,
-- and scores 1: it's no "close match".
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

create or replace function public.claim_person_as_self(
  p_person_id uuid, p_first text, p_last text, p_tree uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The typed name has to match the entry, unless an invite named it for
  -- them: that vouch is the stronger signal (Step 30.2).
  return private.claim_as_self(
    p_person_id,
    coalesce(p_tree, private.current_tree_id()),
    private.person_invited_to_claim(p_person_id)
      or private.self_candidate_score(p_person_id, p_first, p_last) is not null
  );
end;
$$;
