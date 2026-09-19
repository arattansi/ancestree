-- Step 18.2 — Invite someone straight in as a Leaf
--
-- Until now every invite made a Canopy member, and a Root changed their type
-- afterwards. An invite now says what the person joins as — Canopy or Leaf —
-- and `redeem_invite` gives them exactly that.
--
-- Who may mint which:
--
--   Root                         Canopy or Leaf, always
--   Branch                       Leaf, always — part of tending their side;
--                                Canopy too if a Root has let them invite
--   Canopy, if a Root allows it  Canopy or Leaf
--   Leaf, if a Root allows it    Leaf — never someone wider than themselves
--
-- A Branch can bring a relative in, but only as a Leaf: widening anyone past
-- their own entry stays a Root's call, made on /admin after they join.
--
-- Two holes closed on the way. `invites_update` lets whoever minted a link
-- edit it, so a Branch could mint a Leaf link and then turn it into a Canopy
-- one; and anyone allowed to insert an invite could set `person_id`, which
-- vouches the redeemer onto that entry with no name match (Step 12's claim
-- invite, meant to be a Root's). A trigger now keeps both to Roots.

alter table public.invites
  add column joins_as text not null default 'member'
    constraint invites_joins_as_check check (joins_as in ('member', 'leaf'));

comment on column public.invites.joins_as is
  'The account type (profiles.role) the redeemer joins as: member (Canopy) or leaf. Branch and Root are given on /admin, never by link.';

-- ---------------------------------------------------------------------------
-- Who may mint an invite that joins as `p_joins_as`
-- ---------------------------------------------------------------------------

create or replace function private.can_invite_as(p_tree_id uuid, p_joins_as text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or (
      private.is_tree_member(p_tree_id)
      and exists (
        select 1
        from public.profiles p
        where p.auth_user_id = (select auth.uid())
          and (
            -- A Branch brings relatives in as Leaves, no grant needed.
            (p.role = 'branch_admin' and p_joins_as = 'leaf')
            -- Anyone a Root lets invite, never wider than they are.
            or (p.can_invite and (p.role <> 'leaf' or p_joins_as = 'leaf'))
          )
      )
    );
$$;

grant execute on function private.can_invite_as(uuid, text) to authenticated, service_role;

drop policy invites_insert on public.invites;
create policy invites_insert on public.invites
  for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.can_invite_as(tree_id, joins_as))
  );

-- ---------------------------------------------------------------------------
-- What an invite joins as, and whose entry it vouches for, are a Root's
-- ---------------------------------------------------------------------------

create or replace function private.invites_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Roots, and server-side writes with no signed-in user (the service role).
  if (select auth.uid()) is null or private.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    -- Clearing `person_id` is allowed: it is how the entry's deletion reaches
    -- here (on delete set null), and it can only narrow the invite.
    if new.joins_as is distinct from old.joins_as
       or (new.person_id is not null
           and new.person_id is distinct from old.person_id) then
      raise exception 'Only a Root can change what an invite joins as, or whose entry it is for'
        using errcode = '42501';
    end if;
  elsif new.person_id is not null then
    raise exception 'Only a Root can invite someone to claim a particular entry'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger invites_guard
  before insert or update on public.invites
  for each row execute function private.invites_guard();

-- ---------------------------------------------------------------------------
-- redeem_invite: join as what the invite says
-- ---------------------------------------------------------------------------

create or replace function public.redeem_invite(
  p_token text,
  p_display_name text default null
)
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
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    return v_profile;
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  v_email := private.current_email();

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  insert into public.profiles (auth_user_id, display_name, role, can_invite, invited_by_user_id)
  values (
    v_uid,
    coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)),
    v_invite.joins_as,
    false,
    v_invite.created_by
  )
  returning * into v_profile;

  update public.invites
  set status = 'accepted',
      accepted_by_user_id = v_uid,
      updated_at = now()
  where id = v_invite.id;

  return v_profile;
end;
$$;

-- ---------------------------------------------------------------------------
-- invite_preview: the join page says what they'll join as. Dropped first —
-- the return type changes, which `create or replace` cannot do.
-- ---------------------------------------------------------------------------

drop function if exists public.invite_preview(text);

create function public.invite_preview(p_token text)
returns table (
  valid boolean,
  inviter_name text,
  tree_name text,
  claim_person_name text,
  joins_as text
)
language sql
stable
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
    i.joins_as
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now());
$$;

grant execute on function public.invite_preview(text) to anon, authenticated, service_role;
