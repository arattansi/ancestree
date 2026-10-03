-- Step 118.1: the sample family.
--
-- Aalim asked (2026-10-03), after a Reddit reply on the beta campaign link
-- ("You can't tell how good/bad/useful/capable the site is without creating
-- an account"), for a sample tree anyone can look through before signing
-- up: an invented family, four generations, Gujarat → Zanzibar → Toronto,
-- every name and date fiction; no faces; look only. Step 118.2 shows it
-- signed out at /sample; this migration only makes room for it and keeps
-- it out of everything real. The family itself is written by
-- `npm run sample:seed` (scripts/seed-sample-tree.ts), with the service
-- role, after this has run.
--
--   * `trees.is_sample`: the one sample tree (a partial unique index allows
--     only one). `private.sample_tree_id()` and `private.sample_owner()`
--     (the account that holds it) name it for the rules below.
--   * Who holds it: a system account, not a reviewer's. It has no tree
--     memberships at all, so nobody is a Root or member of the sample and
--     no member rule (edit, add, invite, approve, newsletter) ever reaches
--     it; its auth user is banned, so nobody signs in as it; and deleting
--     or suspending a reviewer's account can never take the sample with it.
--   * `private.sample_sealed()`: a trigger on every table that can point at
--     a tree or an entry. A row touching the sample (its tree, an entry
--     homed there, a story or photo on it) is refused to anyone signed in,
--     whatever an RPC or policy would allow, so the sample stays look-only
--     however later steps open it up. Joining it, inviting to it, asking
--     to join it, sharing it, showing it to another tree and claiming in it
--     are refused even to the service role (the public "ask to join" form
--     writes with it): the sample never has members.
--   * Kept out: `person_is_claimable` is false for its people, which keeps
--     them out of "This is me", claims and claim invites, the requests a
--     Root matches, and `trees_matching_name` (the public "join a tree"
--     search). `engagement_dashboard` leaves its tree, entries, stories,
--     photos and owner out of every count; `find_trees` and
--     `find_accounts` (the /admin manage tab) never list it or its owner.
--     The newsletter needs nothing: it goes to members, and the sample has
--     none. Carry-a-line asks need nothing either: nobody can see its
--     people to carry them, and the seal refuses a placement anyway.

alter table public.trees add column is_sample boolean not null default false;

create unique index trees_one_sample on public.trees ((true)) where is_sample;

comment on column public.trees.is_sample is
  'Step 118.1: the invented, look-only sample family shown at /sample. At most one; no members; sealed by private.sample_sealed().';

create or replace function private.sample_tree_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.id from public.trees t where t.is_sample;
$$;

create or replace function private.sample_owner()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select t.created_by from public.trees t where t.is_sample;
$$;

-- Whether a row of `p_table` touches the sample tree `p_sample`: it is the
-- tree (or would make another one the sample), names it, or names an entry
-- homed on it, a story about one or on it, or a photo on it.
create or replace function private.touches_sample(p_table text, p_row jsonb, p_sample uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    case when p_table = 'trees' then
      (p_row ->> 'id')::uuid = p_sample or coalesce((p_row ->> 'is_sample')::boolean, false)
    end, false)
  or coalesce(p_sample in ((p_row ->> 'tree_id')::uuid, (p_row ->> 'viewer_tree_id')::uuid), false)
  or exists (
    select 1 from public.people pe
    where pe.tree_id = p_sample
      and pe.id in (
        (p_row ->> 'person_id')::uuid,
        (p_row ->> 'from_person')::uuid,
        (p_row ->> 'to_person')::uuid,
        (p_row ->> 'subject_person_id')::uuid,
        (p_row ->> 'related_person_id')::uuid,
        (p_row ->> 'primary_person_id')::uuid
      )
  )
  or exists (
    select 1 from public.stories s
    left join public.people pe on pe.id = s.person_id
    where s.id = (p_row ->> 'story_id')::uuid
      and (s.tree_id = p_sample or pe.tree_id = p_sample)
  )
  or exists (
    select 1 from public.album_photos a
    where a.id = (p_row ->> 'photo_id')::uuid
      and a.tree_id = p_sample
  );
$$;

create or replace function private.sample_sealed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sample uuid := private.sample_tree_id();
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
begin
  if (v_sample is null and tg_table_name <> 'trees')
     or not (
       coalesce(private.touches_sample(tg_table_name, v_new, v_sample), false)
       or coalesce(private.touches_sample(tg_table_name, v_old, v_sample), false)
     ) then
    return coalesce(new, old);
  end if;
  -- The sample never has members, invites, requests to join, share links,
  -- visitors or claims: not even through the service role.
  if tg_table_name in ('tree_members', 'tree_visibility', 'invites', 'invite_requests', 'share_links', 'claims') then
    raise exception 'SAMPLE_TREE: the sample family is look-only' using errcode = '42501';
  end if;
  -- Everything else is the seed's alone (the service role, or postgres).
  if (select auth.uid()) is not null then
    raise exception 'SAMPLE_TREE: the sample family is look-only' using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

revoke all on function private.sample_tree_id() from public, anon;
revoke all on function private.sample_owner() from public, anon;
revoke all on function private.touches_sample(text, jsonb, uuid) from public, anon, authenticated;
revoke all on function private.sample_sealed() from public, anon, authenticated;
grant execute on function private.sample_tree_id() to authenticated, service_role;
grant execute on function private.sample_owner() to authenticated, service_role;

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'trees', 'people', 'relationships', 'tree_placements', 'tree_members',
    'tree_visibility', 'invites', 'invite_requests', 'share_links',
    'stories', 'story_mentions', 'story_credits', 'story_comments',
    'story_links', 'album_photos', 'album_tags', 'claims',
    'entry_suggestions', 'entry_reports', 'entry_revisions',
    'connection_suggestions', 'bloodline_anchors', 'pets', 'pet_companions'
  ] loop
    execute format(
      'create trigger %I before insert or update or delete on public.%I '
      'for each row execute function private.sample_sealed()',
      v_table || '_sample_sealed', v_table);
  end loop;
end;
$$;

CREATE OR REPLACE FUNCTION private.person_is_claimable(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      -- Nobody in the sample family is anyone's own (Step 118.1): no claim,
      -- no "This is me", no tree found by their name.
      and pe.tree_id is distinct from private.sample_tree_id()
  );
$function$;

CREATE OR REPLACE FUNCTION public.engagement_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := private.utc_day(now());
  -- The last seven days, today included; the seven before them; the last 30.
  v_week_start date := v_today - 6;
  v_prev_start date := v_today - 13;
  v_month_start date := v_today - 29;
  -- The sample tree and the account that holds it (Step 118.1) are
  -- nobody's engagement: left out of every count.
  v_sample uuid := private.sample_tree_id();
  v_owner uuid := private.sample_owner();
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'members', (
      select count(*) from public.profiles p
      where p.auth_user_id is distinct from v_owner),
    'members_new', (
      select count(*) from public.profiles p
      where private.utc_day(p.created_at) >= v_week_start
        and p.auth_user_id is distinct from v_owner),
    'active_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_week_start),
    'active_prev_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_prev_start and a.day < v_week_start),
    'active_30', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_month_start),
    'entries', (
      select count(*) from public.people p
      where p.tree_id is distinct from v_sample),
    'entries_new', (
      select count(*) from public.people p
      where private.utc_day(p.created_at) >= v_week_start
        and p.tree_id is distinct from v_sample),

    -- Twelve weeks, oldest first.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
          'end', w.last_day,
          'active', (
            select count(distinct a.user_id) from private.active_days a
            where a.day between w.last_day - 6 and w.last_day),
          'joined', (
            select count(*) from public.profiles p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day
              and p.auth_user_id is distinct from v_owner),
          'entries', (
            select count(*) from public.people p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day
              and p.tree_id is distinct from v_sample))
        order by w.last_day)
      from (select v_today - 7 * g as last_day from generate_series(0, 11) g) w),

    -- How many members have done each thing at least once.
    'progress', jsonb_build_object(
      'own_entry', (
        select count(*) from public.profiles p where p.self_person_id is not null),
      'added_relative', (
        select count(distinct e.created_by)
        from public.people e
        join public.profiles p on p.auth_user_id = e.created_by
        where e.id is distinct from p.self_person_id
          and p.auth_user_id is distinct from v_owner),
      'invited', (
        select count(distinct s.user_id)
        from (
          -- An invite sent by email, or a request for access let in.
          select q.reviewed_by as user_id from public.invite_requests q
          where q.status = 'approved'
          union all
          -- Any link still out: family, founder, or an older bare one.
          select i.created_by from public.invites i
        ) s
        join public.profiles p on p.auth_user_id = s.user_id),
      'came_back', (
        select count(*) from (
          select a.user_id from private.active_days a
          group by a.user_id
          having count(*) >= 2) s)),

    -- What was done, by kind: in the last seven days, the seven before,
    -- and ever. A kind nothing has happened to is left out.
    'activity', (
      select coalesce(jsonb_object_agg(k.kind, k.counts), '{}'::jsonb)
      from (
        select e.kind, jsonb_build_object(
            'last_7', count(*) filter (where e.day >= v_week_start),
            'prev_7', count(*) filter (
              where e.day >= v_prev_start and e.day < v_week_start),
            'total', count(*)) as counts
        from (
          select 'entries' as kind, private.utc_day(p.created_at) as day
          from public.people p where p.tree_id is distinct from v_sample
          union all select 'connections', private.utc_day(r.created_at)
          from public.relationships r where r.tree_id is distinct from v_sample
          union all select 'photos', private.utc_day(o.created_at)
          from storage.objects o where o.bucket_id = 'photos'
          union all select 'album', private.utc_day(a.created_at)
          from public.album_photos a where a.tree_id is distinct from v_sample
          union all select 'stories', private.utc_day(s.created_at)
          from public.stories s where s.tree_id is distinct from v_sample
          union all select 'story_comments', private.utc_day(c.created_at)
          from public.story_comments c
          union all select 'comments', private.utc_day(c.created_at)
          from public.pet_comments c
          union all select 'companions', private.utc_day(p.created_at)
          from public.pets p
          union all select 'claims', private.utc_day(c.created_at)
          from public.claims c
          union all select 'invites', private.utc_day(coalesce(q.reviewed_at, q.created_at))
          from public.invite_requests q where q.status = 'approved'
          union all select 'joins', private.utc_day(m.created_at)
          from public.tree_members m
          union all select 'access_requests', private.utc_day(q.created_at)
          from public.invite_requests q where q.source is distinct from 'direct'
          union all select 'tree_requests', private.utc_day(q.created_at)
          from public.tree_requests q
          union all select 'relayed_asks', private.utc_day(r.created_at)
          from public.invite_relays r
        ) e
        group by e.kind
      ) k),

    -- Each tree, oldest first. Its members' days count wherever they
    -- spent them; its entries are what it shows, from other trees too.
    'trees', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'founded', private.utc_day(t.created_at),
          'members', (
            select count(*) from public.tree_members m where m.tree_id = t.id),
          'active_7', (
            select count(distinct m.user_id)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id and a.day >= v_week_start),
          'entries', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'),
          'added_7', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'
              and private.utc_day(pl.created_at) >= v_week_start),
          'last_active', (
            select max(a.day)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id))
        order by t.created_at), '[]'::jsonb)
      from public.trees t
      where not t.is_sample)
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_trees(p_query text DEFAULT NULL::text, p_tree uuid DEFAULT NULL::uuid)
 RETURNS TABLE(tree_id uuid, name text, created_at timestamp with time zone, members integer, entries integer, roots text[])
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  if v_q is null and p_tree is null then
    return;
  end if;
  v_like := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select
      t.id,
      t.name,
      t.created_at,
      (select count(*)::integer from public.tree_members m where m.tree_id = t.id),
      (select count(*)::integer from public.people pe where pe.tree_id = t.id),
      coalesce((
        select array_agg(coalesce(p.display_name, 'Unnamed member') order by m.created_at)
        from public.tree_members m
        join public.profiles p on p.auth_user_id = m.user_id
        where m.tree_id = t.id and m.role = 'admin'
      ), '{}'::text[])
    from public.trees t
    where case
      when p_tree is not null then t.id = p_tree
      else t.name ilike v_like
    end
      -- The sample tree is no reviewer's to manage (Step 118.1).
      and not t.is_sample
    order by (lower(t.name) = lower(v_q)) desc nulls last, t.created_at desc
    limit 20;
end;
$function$;

CREATE OR REPLACE FUNCTION public.find_accounts(p_query text DEFAULT NULL::text, p_user uuid DEFAULT NULL::uuid)
 RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamp with time zone, last_sign_in_at timestamp with time zone, suspended boolean, reviewer boolean, trees jsonb)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_q text := nullif(btrim(coalesce(p_query, '')), '');
  v_like text;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  if v_q is null and p_user is null then
    return;
  end if;
  v_like := '%' || replace(replace(replace(coalesce(v_q, ''), '\', '\\'), '%', '\%'), '_', '\_') || '%';

  return query
    select
      u.id,
      u.email::text,
      p.display_name,
      u.created_at,
      u.last_sign_in_at,
      coalesce(u.banned_until > now(), false),
      exists (select 1 from private.beta_reviewers r where lower(r.email) = lower(u.email)),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'role', m.role,
          'successors', case
            when m.role = 'admin' and not exists (
              select 1 from public.tree_members o
              where o.tree_id = m.tree_id and o.role = 'admin' and o.user_id <> u.id
            ) then coalesce((
              select jsonb_agg(jsonb_build_object(
                'user_id', o.user_id, 'name', op.display_name, 'role', o.role
              ) order by op.display_name)
              from public.tree_members o
              join public.profiles op on op.auth_user_id = o.user_id
              where o.tree_id = m.tree_id and o.user_id <> u.id
            ), '[]'::jsonb)
          end
        ) order by t.name)
        from public.tree_members m
        join public.trees t on t.id = m.tree_id
        where m.user_id = u.id
      ), '[]'::jsonb)
    from auth.users u
    left join public.profiles p on p.auth_user_id = u.id
    where case
      when p_user is not null then u.id = p_user
      else u.email ilike v_like or p.display_name ilike v_like
    end
      -- Nor the account that holds it.
      and u.id is distinct from private.sample_owner()
    order by (lower(u.email) = lower(v_q)) desc nulls last, u.created_at desc
    limit 20;
end;
$function$;
