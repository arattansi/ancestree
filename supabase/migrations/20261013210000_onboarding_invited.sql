-- Step 151 follow-up — "invited" counts invites that were accepted
--
-- `onboarding_due` (20261013200000) said a member had invited family only
-- while one of their invites was still there. An accepted invite is
-- deleted as it's redeemed, so a member whose relatives had all joined
-- read as never having invited anyone (four of five such members on
-- 2026-10-14). It now also counts anyone who joined through them
-- (`tree_members.invited_by_user_id`) and the invites their approved
-- "Sent invites" records name (`invite_requests.reviewed_by`). Nothing
-- else changes.

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
    -- records name.
    exists (
      select 1 from public.invites i
      where i.created_by = s.user_id and not i.founds_tree
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
