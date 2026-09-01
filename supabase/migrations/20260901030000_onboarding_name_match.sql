-- Step 15 — Fuzzy first-run onboarding.
--
-- New members start by typing just their first + last name. We search the
-- shared tree for unclaimed entries that look like them — tolerating spelling
-- mistakes, accents, nicknames and phonetic variants ("Ratansi" / "Rattansi",
-- "Catherine" / "Katherine") — so they can take ownership of an entry a
-- relative already added instead of creating a duplicate.
--
-- 1. `private.fold_name` / `private.name_score` — normalise + score one name
--    pair, blending trigram similarity, edit distance and double metaphone.
-- 2. `public.search_self_candidates` — ranked, claimable matches for a typed
--    name. Callable before the member has a `self_person_id`.
-- 3. `public.claim_person_as_self` — take ownership of one of those matches
--    during onboarding (no stub to merge, unlike `claim_person`).

create extension if not exists unaccent with schema extensions;
create extension if not exists fuzzystrmatch with schema extensions;

-- ---------------------------------------------------------------------------
-- private.fold_name — lowercase, strip accents and punctuation, cap length.
-- `null` for anything that folds away to nothing.
-- ---------------------------------------------------------------------------
create or replace function private.fold_name(p_name text)
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(
    left(
      regexp_replace(
        lower(
          -- two-arg form: the one-arg one resolves its dictionary through
          -- search_path, which is empty inside these functions.
          extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(p_name, ''))
        ),
        '[^a-z0-9]+', '', 'g'
      ),
      120
    ),
    ''
  );
$$;

grant execute on function private.fold_name(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.name_score — 0..1 similarity between two names, spelling-tolerant.
-- ---------------------------------------------------------------------------
create or replace function private.name_score(p_a text, p_b text)
returns real
language plpgsql
stable
set search_path = ''
as $$
declare
  a text := private.fold_name(p_a);
  b text := private.fold_name(p_b);
  s real;
begin
  if a is null or b is null then return 0; end if;
  if a = b then return 1; end if;

  -- Trigram overlap, floored by normalised edit distance so short names
  -- (where trigrams are sparse) still score sensibly: "Ali" vs "Alu".
  s := greatest(
    extensions.similarity(a, b),
    1.0 - extensions.levenshtein(a, b)::real / greatest(length(a), length(b))
  );

  -- Sounds the same, spelled differently: Catherine / Katherine.
  if length(a) > 2 and length(b) > 2 then
    if nullif(extensions.dmetaphone(a), '') is not distinct from
       nullif(extensions.dmetaphone(b), '')
      and extensions.dmetaphone(a) <> ''
    then
      s := greatest(s, 0.85);
    end if;
  end if;

  -- Shortened forms of the same name: Ali / Alimah, Sam / Samir.
  if length(a) >= 3 and length(b) >= 3
    and (a like b || '%' or b like a || '%')
  then
    s := greatest(s, 0.75);
  end if;

  return least(greatest(s, 0), 1);
end;
$$;

grant execute on function private.name_score(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.self_candidate_score — how well an entry matches a typed name.
-- Returns null when either half is too far off to be a plausible match.
-- ---------------------------------------------------------------------------
create or replace function private.self_candidate_score(
  p_person_id uuid,
  p_first text,
  p_last text
)
returns real
language sql
stable
set search_path = ''
as $$
  select case
    when f >= 0.4 and l >= 0.4 and (f + l) / 2 >= 0.55 then (f + l) / 2
    else null
  end
  from (
    select
      greatest(
        private.name_score(p_first, pe.first_name),
        private.name_score(p_first, pe.preferred_name)
      ) as f,
      greatest(
        private.name_score(p_last, pe.last_name),
        private.name_score(p_last, pe.maiden_name)
      ) as l
    from public.people pe
    where pe.id = p_person_id
  ) parts;
$$;

grant execute on function private.self_candidate_score(uuid, text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- private.person_is_claimable — nobody real is behind the entry yet.
-- ---------------------------------------------------------------------------
create or replace function private.person_is_claimable(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.people pe
    where pe.id = p_person_id
      and pe.owner_user_id = pe.created_by
      and not exists (
        select 1 from public.profiles p where p.self_person_id = pe.id
      )
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.status = 'approved'
      )
  );
$$;

grant execute on function private.person_is_claimable(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.search_self_candidates — "is one of these you?" for onboarding.
-- SECURITY DEFINER: the caller has no self entry yet, so the usual
-- member-scoped read paths aren't available to them.
-- ---------------------------------------------------------------------------
create or replace function public.search_self_candidates(
  p_first text,
  p_last text
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
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where auth_user_id = v_uid) then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if private.fold_name(p_last) is null then
    return;
  end if;

  select t.id into v_tree
  from public.trees t
  order by t.created_at asc
  limit 1;

  if v_tree is null then
    return;
  end if;

  return query
  select
    pe.id,
    pe.first_name,
    pe.preferred_name,
    pe.last_name,
    pe.maiden_name,
    pe.date_of_birth,
    pe.date_of_death,
    pe.is_deceased,
    pe.city_of_birth,
    pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
    ) as parent_names,
    private.self_candidate_score(pe.id, p_first, p_last) as score
  from public.people pe
  where pe.tree_id = v_tree
    and private.self_candidate_score(pe.id, p_first, p_last) is not null
    and private.person_is_claimable(pe.id)
    -- don't re-suggest an entry this member already disputed onto
    and not exists (
      select 1 from public.claims c
      where c.person_id = pe.id
        and c.claimant_user_id = v_uid
        and c.status = 'disputed'
    )
  order by score desc, pe.date_of_birth asc nulls last
  limit 10;
end;
$$;

revoke all on function public.search_self_candidates(text, text) from anon, public;
grant execute on function public.search_self_candidates(text, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.claim_person_as_self — onboarding claim. Unlike `claim_person` there
-- is no stub to merge: the member has no entry yet, so we just move ownership
-- and point their profile at it. Auto-approves and notifies the creator, who
-- can dispute (same path as `claim_person`).
-- ---------------------------------------------------------------------------
create or replace function public.claim_person_as_self(
  p_person_id uuid,
  p_first text,
  p_last text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_has_profile boolean;
  v_self uuid;
  v_creator uuid;
  v_tree uuid;
  v_shared_tree uuid;
  v_recent int;
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true, self_person_id into v_has_profile, v_self
  from public.profiles
  where auth_user_id = v_uid;

  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if v_self is not null then
    raise exception 'You already have your own entry' using errcode = '23505';
  end if;

  select tree_id, created_by into v_tree, v_creator
  from public.people
  where id = p_person_id;

  if v_tree is null then
    raise exception 'That entry no longer exists';
  end if;

  select id into v_shared_tree
  from public.trees
  order by created_at asc
  limit 1;

  if v_tree is distinct from v_shared_tree then
    raise exception 'That entry is on a different tree';
  end if;

  if not private.person_is_claimable(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;

  -- Rate limit: 5 claims per rolling 24h (mirrors claim_person).
  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid
    and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.'
      using errcode = '54000';
  end if;

  if private.self_candidate_score(p_person_id, p_first, p_last) is null then
    raise exception 'That entry does not match your name closely enough to claim'
      using errcode = '42501';
  end if;

  update public.people set owner_user_id = v_uid where id = p_person_id;
  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator,
    v_uid,
    'claim_approved',
    p_person_id,
    v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative joining the tree. If this looks wrong, you can dispute it.'
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

revoke all on function public.claim_person_as_self(uuid, text, text) from anon, public;
grant execute on function public.claim_person_as_self(uuid, text, text)
  to authenticated, service_role;
