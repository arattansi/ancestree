-- What happens to invites (Step 216, F5 of the 2026-10-27 drop-off audit):
-- the audit couldn't tell a link never shared from one shared and never
-- opened, or one opened and given up on. A first-party record, by invite:
--
--   made        an invite into a tree (a trigger, so every way of making one)
--   shared      a share button a member pressed: share / whatsapp /
--               messages / copy, or the invite emailed (email)
--   opened      its page shown for a live invite, once per visitor a day
--   code_sent   a sign-in code emailed from its page
--   joined      redeemed, by: name (Step 213), email_code, emailed_invite
--               (an emailed invite's one button) or signed_in (a member)
--   email_added a name-first joiner adding an email later (Step 213)
--
-- Redeeming deletes an invite, so its id is kept with no foreign key and a
-- joined invite keeps its history. Opens hold no IP, no user agent and not
-- even the visitor's random id: only a hash of it with the invite and the
-- day, enough to count a visitor once that day. Founder invites start a
-- tree rather than join one, and aren't recorded.

create table private.invite_events (
  id bigint generated always as identity primary key,
  invite_id uuid not null,
  tree_id uuid not null references public.trees (id) on delete cascade,
  kind text not null
    check (kind in ('made', 'shared', 'opened', 'code_sent', 'joined', 'email_added')),
  -- The invite's sort, kept here since the invite may be gone: the family
  -- link, a link to claim an entry, one emailed to an address, or a bare link.
  link text not null check (link in ('family', 'claim', 'email', 'bare')),
  channel text,
  -- Who joined, so an email they add later finds their invite. Nobody
  -- else's, and it goes with their account.
  user_id uuid references auth.users (id) on delete set null,
  -- An open: md5 of the visitor's cookie id, the invite and the UTC day.
  dedupe text unique,
  at timestamptz not null default now(),
  constraint invite_events_channel check (
    (kind = 'shared'
      and channel is not null
      and channel in ('share', 'whatsapp', 'messages', 'copy', 'email'))
    or (kind = 'joined'
      and (channel is null or channel in ('name', 'email_code', 'emailed_invite', 'signed_in')))
    or (kind not in ('shared', 'joined') and channel is null)
  )
);

create index invite_events_tree_at on private.invite_events (tree_id, at);
create index invite_events_invite on private.invite_events (invite_id, kind);
create index invite_events_joined_user on private.invite_events (user_id)
  where kind = 'joined';

alter table private.invite_events enable row level security;
revoke all on private.invite_events from anon, authenticated;

-- An invite's sort, as `link` keeps it.
create function private.invite_link(p_invite public.invites)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_invite.max_uses is not null then 'family'
    when p_invite.invited_email is not null then 'email'
    when p_invite.person_id is not null then 'claim'
    else 'bare'
  end;
$$;

-- Every invite into a tree, however it's made: ensure_family_link, a claim
-- link, an emailed invite, an approved request. A count never stops the
-- invite being made.
create function private.invite_made()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.founds_tree then
    begin
      insert into private.invite_events (invite_id, tree_id, kind, link, at)
      values (new.id, new.tree_id, 'made', private.invite_link(new), new.created_at);
    exception when others then
      raise warning 'invite_events: made not noted — %', sqlerrm;
    end;
  end if;
  return null;
end;
$$;

create trigger invite_events_made
  after insert on public.invites
  for each row execute function private.invite_made();

-- The invite's page, shown for a live invite (the page's beacon, Step 216):
-- once per visitor per invite per UTC day, by a random id from a cookie.
-- Open to anyone, as the page is; a member already on the tree (its Root
-- trying the link) isn't someone it reached, and one link counts at most
-- 200 opens a day. Says nothing back, whatever the token.
create function public.note_invite_opened(p_token text, p_visitor text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
  v_day date := private.utc_day(now());
begin
  if p_token is null or length(p_token) > 200
     or p_visitor is null or length(p_visitor) not between 16 and 100 then
    return;
  end if;

  select * into v_invite from public.invites i where i.token = p_token;
  if not found
     or v_invite.founds_tree
     or v_invite.status <> 'active'
     or v_invite.archived_at is not null
     or (v_invite.expires_at is not null and v_invite.expires_at <= now())
     or (v_invite.max_uses is not null and v_invite.use_count >= v_invite.max_uses) then
    return;
  end if;

  if exists (
    select 1 from public.tree_members m
    where m.tree_id = v_invite.tree_id and m.user_id = (select auth.uid())
  ) then
    return;
  end if;

  if (
    select count(*) from private.invite_events e
    where e.invite_id = v_invite.id
      and e.kind = 'opened'
      and e.at >= v_day::timestamp at time zone 'utc'
  ) >= 200 then
    return;
  end if;

  insert into private.invite_events (invite_id, tree_id, kind, link, dedupe)
  values (
    v_invite.id, v_invite.tree_id, 'opened', private.invite_link(v_invite),
    md5(p_visitor || ':' || v_invite.id::text || ':' || v_day::text)
  )
  on conflict (dedupe) do nothing;
end;
$$;

revoke all on function public.note_invite_opened(text, text) from public;
grant execute on function public.note_invite_opened(text, text) to anon, authenticated, service_role;

-- A share button pressed on an invite: by whoever made it, or a Root of its
-- tree (the family link and the Root console's lists).
create function public.note_invite_shared(p_token text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  if p_channel is null or p_channel not in ('share', 'whatsapp', 'messages', 'copy') then
    raise exception 'INVITE_CHANNEL: not a share button' using errcode = '22023';
  end if;

  select * into v_invite from public.invites i where i.token = p_token;
  if not found or v_invite.founds_tree then
    return;
  end if;
  if v_invite.created_by is distinct from (select auth.uid())
     and not private.is_root_of(v_invite.tree_id) then
    raise exception 'NOT_YOURS: only its sender or a Root shares an invite'
      using errcode = '42501';
  end if;

  insert into private.invite_events (invite_id, tree_id, kind, link, channel)
  values (v_invite.id, v_invite.tree_id, 'shared', private.invite_link(v_invite), p_channel);
end;
$$;

revoke all on function public.note_invite_shared(text, text) from public, anon;
grant execute on function public.note_invite_shared(text, text) to authenticated, service_role;

-- What the server notes itself, having checked who may (service role only):
-- an invite emailed (shared, email) and a sign-in code sent from its page.
create function public.note_invite_event(p_token text, p_kind text, p_channel text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  if not (
    (p_kind = 'shared' and p_channel = 'email')
    or (p_kind = 'code_sent' and p_channel is null)
  ) then
    raise exception 'INVITE_EVENT: not one the server notes' using errcode = '22023';
  end if;

  select * into v_invite from public.invites i where i.token = p_token;
  if not found or v_invite.founds_tree then
    return;
  end if;

  insert into private.invite_events (invite_id, tree_id, kind, link, channel)
  values (v_invite.id, v_invite.tree_id, p_kind, private.invite_link(v_invite), p_channel);
end;
$$;

revoke all on function public.note_invite_event(text, text, text) from public, anon, authenticated;
grant execute on function public.note_invite_event(text, text, text) to service_role;

-- A member who joined by name adding an email (Step 213): once, on the
-- invite they joined by (service role only, after the address is theirs).
create function public.note_invite_email_added(p_user uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into private.invite_events (invite_id, tree_id, kind, link, user_id)
  select e.invite_id, e.tree_id, 'email_added', e.link, e.user_id
  from private.invite_events e
  where e.user_id = p_user
    and e.kind = 'joined'
    and e.channel = 'name'
    and not exists (
      select 1 from private.invite_events x
      where x.user_id = p_user and x.kind = 'email_added'
    )
  order by e.at desc
  limit 1;
$$;

revoke all on function public.note_invite_email_added(uuid) from public, anon, authenticated;
grant execute on function public.note_invite_email_added(uuid) to service_role;

-- Redeeming says how they came in (`p_path`), and notes the join. Body as
-- in 20260925090000_redeem_says_what_it_claimed, with the invite's id, tree
-- and sort read beside the rest and the join noted after `redeem_invite`.
-- The two-argument version goes, so a call without the path still resolves.
drop function public.redeem_invite_tree(text, text);

create function public.redeem_invite_tree(
  p_token text,
  p_display_name text default null,
  p_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_claim_invite boolean := false;
  v_had_entry boolean := false;
  v_was_member boolean := false;
  v_invite public.invites;
  v_profile public.profiles;
  v_tree public.trees;
begin
  -- As things stood before redeeming. An invite that isn't live is refused
  -- by `redeem_invite` below, whatever is read here.
  select * into v_invite from public.invites i where i.token = p_token;
  v_claim_invite := v_invite.person_id is not null;
  select exists (
    select 1 from public.tree_members m
    where m.tree_id = v_invite.tree_id and m.user_id = v_uid
  ) into v_was_member;

  select p.self_person_id is not null into v_had_entry
  from public.profiles p
  where p.auth_user_id = v_uid;

  v_profile := public.redeem_invite(p_token, p_display_name);
  select * into v_tree from public.trees
  where id = nullif(current_setting('ancestree.redeemed_tree', true), '')::uuid;

  -- What happened to the invite (Step 216), from the row as it was: it may
  -- be gone now. A count never stops the join.
  if v_invite.id is not null and not v_invite.founds_tree then
    begin
      insert into private.invite_events (invite_id, tree_id, kind, link, channel, user_id)
      values (
        v_invite.id, v_invite.tree_id, 'joined', private.invite_link(v_invite),
        case when p_path in ('name', 'email_code', 'emailed_invite', 'signed_in') then p_path end,
        v_uid
      );
    exception when others then
      raise warning 'invite_events: join not noted — %', sqlerrm;
    end;
  end if;

  return jsonb_build_object(
    'tree_id', v_tree.id, 'tree_slug', v_tree.slug, 'tree_name', v_tree.name,
    'self_person_id', v_profile.self_person_id,
    -- Claimed on the way in (Step 30.2), or there already: the app opens the
    -- canvas on it rather than onboarding.
    'self_placed', private.is_placed(v_tree.id, v_profile.self_person_id),
    -- Which welcome, if any (Step 50).
    'claim_invite', coalesce(v_claim_invite, false),
    'had_entry', coalesce(v_had_entry, false),
    'was_member', coalesce(v_was_member, false)
  );
end;
$$;

revoke all on function public.redeem_invite_tree(text, text, text) from anon, public;
grant execute on function public.redeem_invite_tree(text, text, text) to authenticated, service_role;

-- The analytics tab's invites (beta reviewers only, like
-- `engagement_dashboard`): per tree with anything in the last 30 days,
-- links made, shared, opened, codes sent, joins by path, emails added.
-- Each tree says whose it is: a beta reviewer's ('ours'), a test account's
-- (founded from resend.dev or example.com), or an outside founder's.
create function public.invite_funnel()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_since timestamptz := now() - interval '30 days';
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', private.utc_day(now()),
    'counted_from', (select private.utc_day(min(e.at)) from private.invite_events e),
    'trees', coalesce((
      select jsonb_agg(row_to_json(t)::jsonb order by t.joined desc, t.opened desc, t.made desc, t.name)
      from (
        select
          tr.id,
          tr.name,
          coalesce((
            select jsonb_agg(coalesce(p.display_name, 'Unnamed member') order by m.created_at)
            from public.tree_members m
            join public.profiles p on p.auth_user_id = m.user_id
            where m.tree_id = tr.id and m.role = 'admin'), '[]'::jsonb) as roots,
          case
            when exists (
              select 1 from public.tree_members m
              join auth.users u on u.id = m.user_id
              join private.beta_reviewers r on lower(r.email) = lower(u.email)
              where m.tree_id = tr.id and m.role = 'admin') then 'ours'
            when exists (
              select 1 from auth.users u
              where u.id = tr.created_by
                and (u.email ilike '%@resend.dev' or u.email ilike '%@example.com')) then 'test'
            else 'outside'
          end as owner,
          c.made, c.shared, c.shares, c.opened, c.code_sent, c.joined, c.email_added,
          (select coalesce(jsonb_object_agg(x.channel, x.n), '{}'::jsonb)
           from (
             select e.channel, count(*) as n from private.invite_events e
             where e.tree_id = tr.id and e.at >= v_since and e.kind = 'shared'
             group by e.channel) x) as shares_by,
          (select coalesce(jsonb_object_agg(x.channel, x.n), '{}'::jsonb)
           from (
             select coalesce(e.channel, 'unknown') as channel, count(*) as n
             from private.invite_events e
             where e.tree_id = tr.id and e.at >= v_since and e.kind = 'joined'
             group by 1) x) as joined_by
        from (
          select
            e.tree_id,
            count(*) filter (where e.kind = 'made') as made,
            count(distinct e.invite_id) filter (where e.kind = 'shared') as shared,
            count(*) filter (where e.kind = 'shared') as shares,
            count(*) filter (where e.kind = 'opened') as opened,
            count(*) filter (where e.kind = 'code_sent') as code_sent,
            count(*) filter (where e.kind = 'joined') as joined,
            count(*) filter (where e.kind = 'email_added') as email_added
          from private.invite_events e
          where e.at >= v_since
          group by e.tree_id
        ) c
        join public.trees tr on tr.id = c.tree_id
      ) t
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.invite_funnel() from public, anon;
grant execute on function public.invite_funnel() to authenticated;
