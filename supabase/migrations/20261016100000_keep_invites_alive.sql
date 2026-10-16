-- Step 163 — Onboarding R4: keep invites alive
--
-- From the 2026-10-16 onboarding audit (W4): 18 people joined through an
-- invite and 18 invites ran out unused, nothing reminded the invitee, and
-- an expired link was a dead end. Aalim's decisions: an invite lasts 30
-- days (`INVITE_LIFETIME_DAYS`, the app's number), the invitee is reminded
-- on day 5 and day 25 with the same link, and whoever holds an expired
-- link may have a fresh one sent to the address it was for, at most once a
-- day, with the inviter told (the app does the telling, once the email has
-- gone). The live invites are stretched to 30 days from when they were
-- made; the expired ones are left to their inviters.
--
-- Only invites emailed to an address, into a tree, are reminded or renewed:
-- not a bare claim link, the family link, or a founder invite.
--
-- 1. `invites.renewed_at`, and `private.address_on_tree`,
--    `private.invite_still_good`, `private.masked_email`: what both of the
--    below ask.
-- 2. `invite_reminders`, `invite_reminders_due()`,
--    `record_invite_reminders(jsonb)`: the daily cron's reminders, noted
--    just before they go (the getting started emails' pattern, Step 151).
-- 3. `lapsed_invite_preview(token)` (anyone holding the link) and
--    `renew_invite(token, days)` (the service role's), with
--    `invites.renewed_at` (made in section 1) for once a day.
-- 4. `invite_preview` also counts the tree's members, for the join page.
-- 5. The `invite_renewed` notice, to the inviter.
-- 6. The live invites stretched to 30 days.

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------

-- First, as `private.invite_still_good` takes the row (section 3 uses it).
alter table public.invites add column renewed_at timestamptz;

comment on column public.invites.renewed_at is
  'Step 163: when someone holding this invite, expired, had a fresh link sent to its address. At most once a day.';

-- An account at this address is a member of the tree already. Addresses
-- are stored lower-cased on both sides.
create or replace function private.address_on_tree(p_email text, p_tree uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.tree_members m on m.user_id = u.id
    where u.email = lower(btrim(p_email))
      and m.tree_id = p_tree
  );
$$;

-- Whether an emailed invite is still worth having, whatever its date: the
-- address isn't on the tree yet, whoever sent it still is, and the entry a
-- claim invite names is still on the tree, living, with nobody behind it.
create or replace function private.invite_still_good(p_invite public.invites)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    not private.address_on_tree(p_invite.invited_email, p_invite.tree_id)
    and exists (
      select 1 from public.tree_members m
      where m.tree_id = p_invite.tree_id and m.user_id = p_invite.created_by
    )
    and (
      p_invite.person_id is null
      or (
        private.person_is_claimable(p_invite.person_id)
        and private.is_placed(p_invite.tree_id, p_invite.person_id)
        and exists (
          select 1 from public.people pe
          where pe.id = p_invite.person_id
            and not pe.is_deceased and pe.date_of_death is null
        )
      )
    );
$$;

-- "l•••@gmail.com": enough for its owner to know it, on a page anyone with
-- the link can open.
create or replace function private.masked_email(p_email text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_email is null or position('@' in p_email) < 2 then null
    else left(p_email, 1) || '•••@' || substr(p_email, position('@' in p_email) + 1)
  end;
$$;

revoke all on function private.address_on_tree(text, uuid) from public, anon, authenticated;
revoke all on function private.invite_still_good(public.invites) from public, anon, authenticated;
revoke all on function private.masked_email(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Reminders
-- ---------------------------------------------------------------------------
-- One row a reminder: stage 1 goes on day 5, stage 2 on day 25. A stage
-- missed (the job didn't run) is skipped once the next is due, so nobody
-- hears twice in a week. Joining deletes the invite, and its rows with it.
create table public.invite_reminders (
  invite_id uuid not null references public.invites (id) on delete cascade,
  stage smallint not null check (stage in (1, 2)),
  sent_at timestamptz not null default now(),
  primary key (invite_id, stage)
);

comment on table public.invite_reminders is
  'Step 163: each reminder an invitee was sent, one an invite a stage (1 = day 5, 2 = day 25). The service role''s only.';

alter table public.invite_reminders enable row level security;
revoke all on table public.invite_reminders from anon, authenticated;

-- Every live invite emailed to an address, into a tree, five days old or
-- more and still worth having (`private.invite_still_good`), with what its
-- reminder needs and the stages it has had. The app picks the stage due
-- (`lib/invite-reminders.ts`). Writes nothing.
create or replace function public.invite_reminders_due()
returns table (
  invite_id uuid,
  token text,
  email text,
  first_name text,
  inviter_name text,
  tree_name text,
  claim_person_name text,
  placeholder boolean,
  created_at timestamptz,
  expires_at timestamptz,
  stages smallint[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.token,
    i.invited_email,
    coalesce(
      nullif(btrim(r.first_name), ''),
      nullif(btrim(pe.preferred_name), ''),
      nullif(btrim(pe.first_name), '')
    ),
    coalesce(p.display_name, 'A family member'),
    t.name,
    case
      when pe.id is null then null
      else btrim(
        coalesce(nullif(btrim(pe.preferred_name), ''), coalesce(pe.first_name, ''))
        || ' ' || pe.last_name
      )
    end,
    pe.placeholder_number is not null,
    i.created_at,
    i.expires_at,
    array(
      select ir.stage from public.invite_reminders ir
      where ir.invite_id = i.id
      order by ir.stage
    )
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  left join lateral (
    select rq.first_name from public.invite_requests rq
    where rq.invite_id = i.id
    order by rq.created_at
    limit 1
  ) r on true
  where i.status = 'active'
    and i.archived_at is null
    and i.invited_email is not null
    and not i.founds_tree
    and i.max_uses is null
    and i.expires_at > now()
    and i.created_at <= now() - interval '5 days'
    and not exists (
      select 1 from public.invite_reminders ir
      where ir.invite_id = i.id and ir.stage = 2
    )
    and not exists (
      select 1 from auth.users u
      where u.email = i.invited_email and u.banned_until > now()
    )
    and private.invite_still_good(i)
  order by i.created_at, i.id;
$$;

revoke all on function public.invite_reminders_due() from public, anon, authenticated;
grant execute on function public.invite_reminders_due() to service_role;

-- `p_sends` is `[{ "invite_id": …, "stage": … }, …]`. Notes each one whose
-- invite is still live and hasn't had that stage, and returns the invites
-- it noted: one another run reached first (the job called twice) is left
-- out and not sent again.
create or replace function public.record_invite_reminders(p_sends jsonb)
returns setof uuid
language sql
security definer
set search_path = ''
as $$
  insert into public.invite_reminders (invite_id, stage)
  select x.invite_id, x.stage
  from jsonb_to_recordset(p_sends) as x (invite_id uuid, stage smallint)
  where exists (
    select 1 from public.invites i
    where i.id = x.invite_id
      and i.status = 'active'
      and i.archived_at is null
      and i.expires_at > now()
  )
  on conflict (invite_id, stage) do nothing
  returning invite_id;
$$;

revoke all on function public.record_invite_reminders(jsonb) from public, anon, authenticated;
grant execute on function public.record_invite_reminders(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 3. An expired link: who it was from, and a fresh one
-- ---------------------------------------------------------------------------
-- What an expired link's page may say to whoever holds it (the token is the
-- secret, as for `invite_preview`): who sent it, into which tree, for which
-- entry, the address masked, how many are on the tree, and `state`:
--   'open'    a fresh link can go to the address now;
--   'sent'    one went in the last day;
--   'joined'  the address is on the tree already;
--   'closed'  no fresh link: whoever sent it has left, or the entry it
--             names is spoken for, gone from the tree, or has died.
-- Nothing for a live invite (`invite_preview` has it), a used one (joining
-- deletes it), a revoked one, or one not emailed to an address.
create or replace function public.lapsed_invite_preview(p_token text)
returns table (
  inviter_name text,
  tree_name text,
  claim_person_name text,
  masked_email text,
  members integer,
  state text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(p.display_name, 'A family member'),
    t.name,
    case
      when pe.id is null then null
      else btrim(
        coalesce(nullif(btrim(pe.preferred_name), ''), coalesce(pe.first_name, ''))
        || ' ' || pe.last_name
      )
    end,
    private.masked_email(i.invited_email),
    (select count(*)::integer from public.tree_members m where m.tree_id = i.tree_id),
    case
      when private.address_on_tree(i.invited_email, i.tree_id) then 'joined'
      when not private.invite_still_good(i) then 'closed'
      when i.renewed_at > now() - interval '1 day' then 'sent'
      else 'open'
    end
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and i.invited_email is not null
    and not i.founds_tree
    and i.max_uses is null
    and i.expires_at is not null
    and i.expires_at <= now();
$$;

revoke all on function public.lapsed_invite_preview(text) from public;
grant execute on function public.lapsed_invite_preview(text) to anon, authenticated, service_role;

-- A fresh link for an expired one's address and entry, for the app to email
-- there (`renewLapsedInvite`): the service role's alone, since it hands the
-- link back. `p_days` is how long it lasts (`INVITE_LIFETIME_DAYS`).
-- `outcome` is `lapsed_invite_preview`'s state, 'renewed' when a link came
-- back, or 'gone' when the token names no expired emailed invite. A live
-- invite already out to the same address for the same entry goes again
-- rather than a second being made; a new one gets the first one's "Sent
-- invites" record, and the expired one is archived and marked renewed.
create or replace function public.renew_invite(p_token text, p_days integer)
returns table (
  outcome text,
  invite_id uuid,
  invite_token text,
  sent_to text,
  minted boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old public.invites;
  v_new public.invites;
  v_minted boolean := false;
begin
  if p_days is null or p_days < 1 or p_days > 90 then
    raise exception 'A lifetime of 1 to 90 days' using errcode = '22023';
  end if;

  select * into v_old
  from public.invites i
  where i.token = p_token
    and i.status = 'active'
    and i.invited_email is not null
    and not i.founds_tree
    and i.max_uses is null
    and i.expires_at is not null
    and i.expires_at <= now()
  for update;
  if not found then
    return query select 'gone'::text, null::uuid, null::text, null::text, false;
    return;
  end if;

  if private.address_on_tree(v_old.invited_email, v_old.tree_id) then
    return query select 'joined'::text, null::uuid, null::text, null::text, false;
    return;
  end if;
  if not private.invite_still_good(v_old) then
    return query select 'closed'::text, null::uuid, null::text, null::text, false;
    return;
  end if;
  if v_old.renewed_at > now() - interval '1 day' then
    return query select 'sent'::text, null::uuid, null::text, null::text, false;
    return;
  end if;

  select * into v_new
  from public.invites i
  where i.tree_id = v_old.tree_id
    and i.invited_email = v_old.invited_email
    and i.person_id is not distinct from v_old.person_id
    and i.status = 'active'
    and i.archived_at is null
    and not i.founds_tree
    and i.max_uses is null
    and i.expires_at > now()
  order by i.created_at desc
  limit 1;

  if not found then
    insert into public.invites
      (tree_id, created_by, status, expires_at, joins_as, founds_tree, person_id, invited_email)
    values (
      v_old.tree_id, v_old.created_by, 'active',
      now() + make_interval(days => p_days),
      v_old.joins_as, false, v_old.person_id, v_old.invited_email
    )
    returning * into v_new;
    v_minted := true;

    insert into public.invite_requests
      (tree_id, first_name, last_name, email, source, status, reviewed_by, reviewed_at, invite_id)
    select r.tree_id, r.first_name, r.last_name, r.email, r.source, 'approved',
      r.reviewed_by, now(), v_new.id
    from public.invite_requests r
    where r.invite_id = v_old.id
    order by r.created_at
    limit 1;
  end if;

  update public.invites i
  set renewed_at = now(),
      archived_at = coalesce(i.archived_at, now())
  where i.id = v_old.id;

  return query select 'renewed'::text, v_new.id, v_new.token, v_new.invited_email, v_minted;
end;
$$;

revoke all on function public.renew_invite(text, integer) from public, anon, authenticated;
grant execute on function public.renew_invite(text, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 4. The join page's count: how many are on the tree already
-- ---------------------------------------------------------------------------
-- Its columns change, so it's dropped and made again, as in
-- 20260925150000_family_link.sql but for `members`.
drop function public.invite_preview(text);

create function public.invite_preview(p_token text)
returns table (
  valid boolean,
  inviter_name text,
  tree_name text,
  claim_person_name text,
  joins_as text,
  founds_tree boolean,
  members integer
)
language sql
security definer
set search_path = ''
as $$
  select
    true as valid,
    coalesce(p.display_name, 'A family member') as inviter_name,
    t.name as tree_name,
    case
      when pe.id is null then null
      else btrim(
        coalesce(nullif(btrim(pe.preferred_name), ''), coalesce(pe.first_name, ''))
        || ' ' || pe.last_name
      )
    end as claim_person_name,
    i.joins_as,
    i.founds_tree,
    (select count(*)::integer from public.tree_members m where m.tree_id = i.tree_id) as members
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and i.archived_at is null
    and (i.expires_at is null or i.expires_at > now())
    and (i.max_uses is null or i.use_count < i.max_uses);
$$;

revoke all on function public.invite_preview(text) from public;
grant execute on function public.invite_preview(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The inviter's notice
-- ---------------------------------------------------------------------------
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved', 'entry_updated',
    'person_added', 'edit_reverted', 'placement_requested',
    'placements_requested', 'placement_accepted', 'placement_declined',
    'placements_lapsed', 'tree_request_approved', 'placed_on_join',
    'joined_by_link', 'change_suggested', 'suggestion_accepted',
    'suggestion_declined', 'story_to_approve', 'story_approved',
    'story_declined', 'story_commented', 'photo_to_approve',
    'photo_approved', 'photo_declined', 'placeholder_child',
    'invite_renewed'
  ));

-- ---------------------------------------------------------------------------
-- 6. The live invites, stretched to 30 days from when they were made
-- ---------------------------------------------------------------------------
update public.invites
set expires_at = created_at + interval '30 days'
where status = 'active'
  and archived_at is null
  and expires_at > now()
  and expires_at < created_at + interval '30 days';
