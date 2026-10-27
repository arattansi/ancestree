-- Step 212 — the founder's invite step makes the family link for them
--
-- Founders invited 3 of the 67 living relatives they added (audit,
-- 2026-10-27), one at a time, and none made a family link, the one way in
-- that brought a burst of joins. The invite step now opens with the link
-- already made, so it can go to the family chat in one tap.
--
-- 1. `ensure_family_link(tree)`: a Root's tree's family link, made with
--    the largest cap if it has none. Under the tree's row lock, like
--    `rotate_family_link`, so two page loads at once end with one link and
--    neither replaces the other's (a link shown and then rotated away would
--    be dead when shared).
-- 2. `onboarding_due`: a family link nobody has joined through doesn't
--    count as having invited anyone, now that it can exist without being
--    asked for; the getting started emails keep asking until someone joins
--    or another invite goes out. Body otherwise 20261013210000's.

create or replace function public.ensure_family_link(p_tree uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_token text;
begin
  if v_uid is null or not private.is_root_of(p_tree) then
    raise exception 'Only a Root can make the family link' using errcode = '42501';
  end if;

  perform 1 from public.trees where id = p_tree for update;

  select i.token into v_token
  from public.invites i
  where i.tree_id = p_tree and i.max_uses is not null;
  if v_token is not null then
    return v_token;
  end if;

  insert into public.invites (tree_id, created_by, status, joins_as, max_uses)
  values (p_tree, v_uid, 'active', 'member', private.family_link_max_uses())
  returning token into v_token;
  return v_token;
end;
$$;
revoke all on function public.ensure_family_link(uuid) from anon, public;
grant execute on function public.ensure_family_link(uuid) to authenticated, service_role;

create or replace function public.onboarding_due(p_users uuid[] default null)
returns table (
  user_id uuid,
  email text,
  self_person_id uuid,
  token uuid,
  started_at timestamptz,
  last_active date,
  claimable uuid[],
  people_added integer,
  invited boolean,
  shared boolean,
  tree_ids uuid[],
  root_of uuid[],
  sends jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.onboarding_settings as s (user_id)
  select pr.auth_user_id
  from public.profiles pr
  where (p_users is null or pr.auth_user_id = any (p_users))
    and exists (
      select 1 from public.tree_members m where m.user_id = pr.auth_user_id
    )
  on conflict on constraint onboarding_settings_pkey do nothing;

  return query
  select
    s.user_id,
    u.email::text,
    pr.self_person_id,
    s.token,
    s.started_at,
    (select max(d.day) from private.active_days d where d.user_id = s.user_id),
    array(
      select pe.id
      from public.people pe
      where pe.created_by = s.user_id
        and pe.id is distinct from pr.self_person_id
        and pe.placeholder_number is null
        and not pe.is_deceased
        and pe.date_of_death is null
        and private.person_is_claimable(pe.id)
        and exists (
          select 1 from public.tree_members m
          where m.user_id = s.user_id and m.tree_id = pe.tree_id
        )
        and not exists (
          select 1 from public.invites i
          where i.person_id = pe.id
            and i.status = 'active'
            and i.archived_at is null
            and (i.expires_at is null or i.expires_at > now())
        )
      order by pe.created_at, pe.id
    ),
    (
      select count(*)::integer from public.people pe
      where pe.created_by = s.user_id
        and pe.id is distinct from pr.self_person_id
    ),
    -- An accepted invite is deleted as it's redeemed, so whoever joined
    -- through them counts too, and every invite their "Sent invites"
    -- records name. A family link nobody has joined through yet doesn't:
    -- the founder's invite step makes one for them (Step 212).
    exists (
      select 1 from public.invites i
      where i.created_by = s.user_id and not i.founds_tree
        and (i.max_uses is null or i.use_count > 0)
    )
      or exists (
        select 1 from public.tree_members m
        where m.invited_by_user_id = s.user_id and m.user_id <> s.user_id
      )
      or exists (
        select 1 from public.invite_requests r
        where r.reviewed_by = s.user_id and r.status = 'approved'
      ),
    exists (select 1 from public.stories st where st.created_by = s.user_id)
      or exists (select 1 from public.album_photos ap where ap.created_by = s.user_id),
    array(
      select m.tree_id
      from public.tree_members m
      where m.user_id = s.user_id
      order by m.created_at, m.tree_id
    ),
    array(
      select m.tree_id
      from public.tree_members m
      where m.user_id = s.user_id and m.role = 'admin'
      order by m.created_at, m.tree_id
    ),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('step', o.step, 'sent_at', o.sent_at)
          order by o.sent_at
        )
        from public.onboarding_sends o
        where o.user_id = s.user_id
      ),
      '[]'::jsonb
    )
  from public.onboarding_settings s
  join public.profiles pr on pr.auth_user_id = s.user_id
  join auth.users u on u.id = s.user_id
  where s.subscribed
    and s.started_at > now() - interval '60 days'
    and (p_users is null or s.user_id = any (p_users))
    and u.email is not null
    and (u.banned_until is null or u.banned_until <= now())
    and exists (select 1 from public.tree_members m where m.user_id = s.user_id);
end;
$$;

revoke all on function public.onboarding_due(uuid[]) from public, anon, authenticated;
grant execute on function public.onboarding_due(uuid[]) to service_role;
