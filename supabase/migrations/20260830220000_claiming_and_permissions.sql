-- Step 7 — Claiming & permissions
--
-- 1. Edit gating: an entry is editable by its owner, an admin, OR its original
--    creator *while the entry is still unclaimed*. Delete stays admin-only.
-- 2. Claim detection: `person_claim_candidates()` surfaces unclaimed entries
--    that look like the caller (same family name + a matching given/preferred
--    name) so the UI can ask "Is this you?".
-- 3. Claiming is auto-approve: `claim_person()` moves ownership to the claimant,
--    merges their onboarding stub into the claimed entry, writes an `approved`
--    claims row, and notifies the original creator.
-- 4. The original creator can `dispute_claim()` (-> status `disputed`, routed to
--    admins), and an admin can `resolve_claim()` to uphold or reverse it.
--
-- Abuse controls: claims are rate-limited (5 / 24h / user), the name-match rule
-- is re-checked server-side, and only admins can reverse an approved claim.

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  actor_user_id uuid references public.profiles (auth_user_id) on delete set null,
  type text not null check (
    type in (
      'claim_approved',
      'claim_disputed',
      'claim_upheld',
      'claim_reversed'
    )
  ),
  person_id uuid references public.people (id) on delete cascade,
  claim_id uuid references public.claims (id) on delete cascade,
  body text not null check (length(btrim(body)) > 0),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx
  on public.notifications (recipient_user_id, created_at desc);
create index notifications_recipient_unread_idx
  on public.notifications (recipient_user_id)
  where read_at is null;
create index notifications_claim_id_idx on public.notifications (claim_id);

alter table public.notifications enable row level security;

-- Recipients see and manage their own notifications; rows are only ever
-- created by the SECURITY DEFINER helpers below (no INSERT policy on purpose).
create policy notifications_select on public.notifications
  for select to authenticated
  using (recipient_user_id = (select auth.uid()));

create policy notifications_update on public.notifications
  for update to authenticated
  using (recipient_user_id = (select auth.uid()))
  with check (recipient_user_id = (select auth.uid()));

create policy notifications_delete on public.notifications
  for delete to authenticated
  using (
    recipient_user_id = (select auth.uid())
    or (select private.is_admin())
  );

revoke all on table public.notifications from anon, public;
grant select, update, delete on table public.notifications to authenticated;

-- ---------------------------------------------------------------------------
-- claims: track the dispute reason and who resolved it
-- ---------------------------------------------------------------------------

alter table public.claims
  add column dispute_reason text,
  add column resolved_by uuid
    references public.profiles (auth_user_id) on delete set null;

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Display label for a person row (mirrors lib/person-name.ts).
create or replace function private.person_label(p_person_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select btrim(
    concat_ws(
      ' ',
      coalesce(nullif(btrim(preferred_name), ''), nullif(btrim(given_name), '')),
      nullif(btrim(family_name), '')
    )
  )
  from public.people
  where id = p_person_id;
$$;

-- True once an entry has an approved claim against it.
create or replace function private.person_is_claimed(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.claims
    where person_id = p_person_id
      and status = 'approved'
  );
$$;

grant execute on function private.person_label(uuid) to authenticated, service_role;
grant execute on function private.person_is_claimed(uuid) to authenticated, service_role;

-- Editable by: admin, current owner, or the original creator while the entry is
-- still unclaimed (owner never moved away from the creator, no approved claim).
create or replace function private.can_edit_person(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_admin()
    or exists (
      select 1
      from public.people pe
      where pe.id = p_person_id
        and (
          pe.owner_user_id = (select auth.uid())
          or (
            pe.created_by = (select auth.uid())
            and pe.owner_user_id = pe.created_by
            and not private.person_is_claimed(pe.id)
          )
        )
    );
$$;

grant execute on function private.can_edit_person(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Internal: post a notification (SECURITY DEFINER — bypasses the no-INSERT RLS)
-- ---------------------------------------------------------------------------
create or replace function private.notify(
  p_recipient uuid,
  p_actor uuid,
  p_type text,
  p_person uuid,
  p_claim uuid,
  p_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_recipient is null or p_recipient = p_actor then
    return;
  end if;
  insert into public.notifications
    (recipient_user_id, actor_user_id, type, person_id, claim_id, body)
  values (p_recipient, p_actor, p_type, p_person, p_claim, p_body);
end;
$$;

grant execute on function private.notify(uuid, uuid, text, uuid, uuid, text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.person_claim_candidates — unclaimed entries that look like the caller
-- ---------------------------------------------------------------------------
create or replace function public.person_claim_candidates()
returns setof public.people
language sql
stable
security definer
set search_path = ''
as $$
  select pe.*
  from public.profiles me
  join public.people self on self.id = me.self_person_id
  join public.people pe on pe.tree_id = self.tree_id
  where me.auth_user_id = (select auth.uid())
    and pe.id <> self.id
    and lower(btrim(pe.family_name)) = lower(btrim(self.family_name))
    and (
      (
        nullif(btrim(self.given_name), '') is not null
        and lower(btrim(self.given_name)) in (
          lower(btrim(coalesce(pe.given_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
      or (
        nullif(btrim(self.preferred_name), '') is not null
        and lower(btrim(self.preferred_name)) in (
          lower(btrim(coalesce(pe.given_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
    )
    -- nobody real is behind the entry yet
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
    );
$$;

revoke all on function public.person_claim_candidates() from anon, public;
grant execute on function public.person_claim_candidates() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.claim_person — auto-approve a claim and merge the caller's stub
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

  -- Re-check the name match server-side (mirrors person_claim_candidates).
  select
    lower(btrim(pe.family_name)) = lower(btrim(s.family_name))
    and (
      (
        nullif(btrim(s.given_name), '') is not null
        and lower(btrim(s.given_name)) in (
          lower(btrim(coalesce(pe.given_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
      or (
        nullif(btrim(s.preferred_name), '') is not null
        and lower(btrim(s.preferred_name)) in (
          lower(btrim(coalesce(pe.given_name, ''))),
          lower(btrim(coalesce(pe.preferred_name, '')))
        )
      )
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) then
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

-- ---------------------------------------------------------------------------
-- public.dispute_claim — original creator contests an approved claim
-- ---------------------------------------------------------------------------
create or replace function public.dispute_claim(
  p_claim_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_creator uuid;
  v_claimant uuid;
  v_status text;
  v_admin uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by
    into v_person, v_claimant, v_status, v_creator
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = p_claim_id;

  if v_person is null then
    raise exception 'That claim no longer exists';
  end if;
  if v_creator is distinct from v_uid then
    raise exception 'Only the person who created this entry can dispute the claim'
      using errcode = '42501';
  end if;
  if v_status <> 'approved' then
    raise exception 'This claim is not open to dispute';
  end if;

  update public.claims
  set status = 'disputed',
      dispute_reason = nullif(btrim(p_reason), ''),
      resolved_at = null,
      resolved_by = null
  where id = p_claim_id;

  perform private.notify(
    v_claimant, v_uid, 'claim_disputed', v_person, p_claim_id,
    'Your claim on ' || private.person_label(v_person)
      || ' was disputed and is now with an admin.'
  );

  for v_admin in
    select auth_user_id from public.profiles where role = 'admin'
  loop
    perform private.notify(
      v_admin, v_uid, 'claim_disputed', v_person, p_claim_id,
      'A claim on ' || private.person_label(v_person)
        || ' is disputed and needs an admin decision.'
    );
  end loop;
end;
$$;

revoke all on function public.dispute_claim(uuid, text) from anon, public;
grant execute on function public.dispute_claim(uuid, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.resolve_claim — admin upholds or reverses a disputed claim
-- ---------------------------------------------------------------------------
create or replace function public.resolve_claim(
  p_claim_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_creator uuid;
  v_claimant uuid;
  v_status text;
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_action not in ('uphold', 'reverse') then
    raise exception 'Unknown action: %', p_action;
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by
    into v_person, v_claimant, v_status, v_creator
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = p_claim_id;

  if v_person is null then
    raise exception 'That claim no longer exists';
  end if;
  if v_status <> 'disputed' then
    raise exception 'Only a disputed claim can be resolved';
  end if;

  if p_action = 'uphold' then
    update public.claims
    set status = 'approved', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;

    perform private.notify(
      v_claimant, v_uid, 'claim_upheld', v_person, p_claim_id,
      'An admin upheld your claim on ' || private.person_label(v_person) || '.'
    );
    perform private.notify(
      v_creator, v_uid, 'claim_upheld', v_person, p_claim_id,
      'An admin upheld the claim on ' || private.person_label(v_person) || '.'
    );
  else
    update public.claims
    set status = 'rejected', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;

    -- Hand ownership back to the original creator and detach the claimant.
    update public.people
    set owner_user_id = created_by
    where id = v_person;

    update public.profiles
    set self_person_id = null
    where auth_user_id = v_claimant
      and self_person_id = v_person;

    perform private.notify(
      v_claimant, v_uid, 'claim_reversed', v_person, p_claim_id,
      'An admin reversed your claim on ' || private.person_label(v_person)
        || '. Re-add your own entry from onboarding if needed.'
    );
    perform private.notify(
      v_creator, v_uid, 'claim_reversed', v_person, p_claim_id,
      'An admin reversed the claim on ' || private.person_label(v_person)
        || '. You have edit rights again.'
    );
  end if;
end;
$$;

revoke all on function public.resolve_claim(uuid, text) from anon, public;
grant execute on function public.resolve_claim(uuid, text) to authenticated, service_role;
