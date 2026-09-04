-- Invite someone to claim a specific entry
--
-- Until now an invite was untargeted: it let someone in, and the claim system
-- worked out on its own which entries might be them, by fuzzy-matching the name
-- on their onboarding stub. That leaves the common case unserved — an admin is
-- looking at an unclaimed entry, knows exactly whose it is, and has their email.
--
-- So an invite can now name a person: "this link is for Zahra Nurmohamed's
-- entry". Two things follow from that.
--
-- 1. The join page can say whose entry it is, instead of a generic welcome.
-- 2. The named entry becomes claimable by whoever redeems that link, *without*
--    the name-match rule. An admin picking the entry and typing the address is
--    a stronger signal than a string comparison, and the rule it replaces is
--    the reason the flow would otherwise fail exactly when it is needed: a
--    married surname, a nickname, or a different spelling.
--
-- Everything else about claiming is unchanged — one claim per entry, the rate
-- limit, the creator's right to dispute, and the admin's to reverse. The vouch
-- widens *who may claim this one entry*, not what a claim does.

alter table public.invites
  add column person_id uuid references public.people (id) on delete set null,
  add column invited_email text;

comment on column public.invites.person_id is
  'The entry this invite is an invitation to claim. Null for an ordinary, untargeted invite.';
comment on column public.invites.invited_email is
  'Who the link was emailed to, for the admin''s own record. Not used for auth — the magic link is.';

create index invites_person_idx on public.invites (person_id)
  where person_id is not null;

-- ---------------------------------------------------------------------------
-- Has an admin vouched for this caller against this entry?
-- ---------------------------------------------------------------------------

create or replace function private.person_invited_to_claim(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.invites i
    where i.person_id = p_person_id
      and i.accepted_by_user_id = (select auth.uid())
  );
$$;

grant execute on function private.person_invited_to_claim(uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- invite_preview — now also names the entry the link is for, so the join page
-- can say what the invite is actually about. Dropped first: the return type
-- changes, which `create or replace` cannot do.
-- ---------------------------------------------------------------------------

drop function if exists public.invite_preview(text);

create function public.invite_preview(p_token text)
returns table (
  valid boolean,
  inviter_name text,
  tree_name text,
  claim_person_name text
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
    end as claim_person_name
  from public.invites i
  join public.trees t on t.id = i.tree_id
  left join public.profiles p on p.auth_user_id = i.created_by
  left join public.people pe on pe.id = i.person_id
  where i.token = p_token
    and i.status = 'active'
    and (i.expires_at is null or i.expires_at > now());
$$;

grant execute on function public.invite_preview(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- person_claim_candidates — the name-matched entries, plus any entry an admin
-- invited this member to claim.
-- ---------------------------------------------------------------------------

create or replace function public.person_claim_candidates()
returns setof public.people
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select self.*
    from public.profiles p
    join public.people self on self.id = p.self_person_id
    where p.auth_user_id = (select auth.uid())
  ),
  -- Everything that is still up for grabs, before asking whether it is *this*
  -- member's to claim.
  unclaimed as (
    select pe.*
    from public.people pe
    join me on me.tree_id = pe.tree_id
    where pe.id <> me.id
      and pe.owner_user_id = pe.created_by
      and not exists (
        select 1 from public.profiles p where p.self_person_id = pe.id
      )
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.status = 'approved'
      )
      -- don't re-suggest something this user has already disputed onto
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id
          and c.claimant_user_id = (select auth.uid())
          and c.status = 'disputed'
      )
  )
  select u.*
  from unclaimed u, me
  where
    -- Looks like them by name …
    (
      lower(btrim(u.last_name)) = lower(btrim(me.last_name))
      and (
        (
          nullif(btrim(me.first_name), '') is not null
          and lower(btrim(me.first_name)) in (
            lower(btrim(coalesce(u.first_name, ''))),
            lower(btrim(coalesce(u.preferred_name, '')))
          )
        )
        or (
          nullif(btrim(me.preferred_name), '') is not null
          and lower(btrim(me.preferred_name)) in (
            lower(btrim(coalesce(u.first_name, ''))),
            lower(btrim(coalesce(u.preferred_name, '')))
          )
        )
      )
    )
    -- … or an admin sent them here for this entry specifically.
    or private.person_invited_to_claim(u.id);
$$;

revoke all on function public.person_claim_candidates() from anon, public;
grant execute on function public.person_claim_candidates() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- claim_person — unchanged except that an admin's vouch stands in for the
-- name match. Every other guard still applies.
-- ---------------------------------------------------------------------------

create or replace function public.claim_person(p_person_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_creator uuid;
  v_tree uuid;
  v_self_tree uuid;
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self
  from public.profiles
  where auth_user_id = v_uid;

  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  select tree_id, created_by into v_tree, v_creator
  from public.people
  where id = p_person_id;

  if v_tree is null then
    raise exception 'That entry no longer exists';
  end if;

  select tree_id into v_self_tree from public.people where id = v_self;
  if v_tree is distinct from v_self_tree then
    raise exception 'That entry is on a different tree';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  -- Rate limit: 5 claims per rolling 24h.
  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid
    and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.'
      using errcode = '54000';
  end if;

  -- Re-check the name match server-side (mirrors person_claim_candidates) —
  -- unless an admin invited this member to claim this exact entry, in which
  -- case their vouch is what we are trusting instead.
  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (
        nullif(btrim(s.first_name), '') is not null
        and lower(btrim(s.first_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
      or (
        nullif(btrim(s.preferred_name), '') is not null
        and lower(btrim(s.preferred_name)) in (
          lower(btrim(coalesce(pe.first_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false)
    and not private.person_invited_to_claim(p_person_id)
  then
    raise exception 'That entry does not match your name closely enough to claim'
      using errcode = '42501';
  end if;

  -- --- Merge the onboarding stub (v_self) into the claimed entry ---

  -- Remap relationships, dropping any that would self-loop or duplicate.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.tree_id = r.tree_id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = v_self then p_person_id else r.from_person end,
            case when r.to_person = v_self then p_person_id else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = v_self then p_person_id else from_person end,
      to_person = case when to_person = v_self then p_person_id else to_person end
  where from_person = v_self or to_person = v_self;

  -- Carry over documents, comments, and (if the claimed entry has none) the photo.
  update public.documents set person_id = p_person_id where person_id = v_self;
  update public.entry_comments set person_id = p_person_id where person_id = v_self;
  update public.people tgt
  set photo_path = stub.photo_path
  from public.people stub
  where tgt.id = p_person_id
    and stub.id = v_self
    and tgt.photo_path is null
    and stub.photo_path is not null;

  -- Point the profile at the claimed entry *before* deleting the stub so the
  -- self_person_id FK (ON DELETE SET NULL) doesn't wipe it.
  update public.profiles
  set self_person_id = p_person_id
  where auth_user_id = v_uid;

  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

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
      || ' was claimed by a relative. If this looks wrong, you can dispute it.'
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

revoke all on function public.claim_person(uuid) from anon, public;
grant execute on function public.claim_person(uuid) to authenticated, service_role;
