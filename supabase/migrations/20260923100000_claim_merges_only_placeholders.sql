-- Step 36 — "This is me" can't swallow a member's own entry
--
-- The canvas's "Is one of these you?" card (`person_claim_candidates`)
-- offered a member who already has their own entry every unclaimed entry on
-- a tree they share whose name matches theirs, the dead included. Its "This
-- is me" (`claim_person`) moved every line, document and note of the
-- member's own entry onto the one they picked, repointed their self link and
-- deleted their own entry. That merge was built for a placeholder the member
-- made for themselves at onboarding. Since Step 30.2 (accepting a claim
-- invite claims the entry) and 30.3 (a Root approves a request as the entry
-- it matched), a member's own entry is usually one a Root made, with their
-- parents, partner and children on it. A grandchild named after a late
-- grandparent was offered the grandparent, and one tap moved their family
-- onto the grandparent and deleted their own entry: no confirmation, and a
-- reversed dispute can't bring it back.
--
-- 1. `private.is_own_placeholder` — an entry the member made for themselves
--    that nobody else has built on: every line, document, note, companion,
--    bloodline anchor and placement on it theirs, no edit or claim by anyone
--    else. The same "built on" test `can_delete_person` uses for deleting.
-- 2. `claim_person` — merges only such a placeholder, and never into an
--    entry marked as having died or given a death date. The placeholder's
--    companions and bloodline anchors now come along too; deleting it used
--    to unlink them, and delete any pet it was the only person of.
-- 3. `person_claim_candidates` — offers nothing to a member whose own entry
--    isn't such a placeholder, and nobody who has died, so neither the card
--    nor the entry panel's "This is me — claim it" (both read this list)
--    appears where the claim would be refused.
--
-- The live bodies of `claim_person` and `person_claim_candidates` were
-- checked against 20260922090000 first (md5 identical).

-- ---------------------------------------------------------------------------
-- 1. A placeholder: made by them, built on by nobody else
-- ---------------------------------------------------------------------------
create or replace function private.is_own_placeholder(p_person uuid, p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user is not null
    and exists (
      select 1 from public.people pe
      where pe.id = p_person and pe.created_by = p_user and pe.owner_user_id = p_user
    )
    and not exists (
      select 1 from public.relationships r
      where (r.from_person = p_person or r.to_person = p_person)
        and r.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.documents d
      where d.person_id = p_person and d.uploaded_by is distinct from p_user
    )
    and not exists (
      select 1 from public.entry_comments ec
      where ec.person_id = p_person and ec.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.pet_companions pc
      join public.pets pt on pt.id = pc.pet_id
      where pc.person_id = p_person
        and (pc.created_by is distinct from p_user or pt.created_by is distinct from p_user)
    )
    and not exists (
      select 1 from public.bloodline_anchors a
      where a.person_id = p_person and a.created_by is distinct from p_user
    )
    -- Placed on a tree by someone else, e.g. a Root bringing it over.
    and not exists (
      select 1 from public.tree_placements pl
      where pl.person_id = p_person and pl.placed_by is distinct from p_user
    )
    and not exists (
      select 1 from public.entry_revisions v
      where v.person_id = p_person and v.editor_user_id is distinct from p_user
    )
    and not exists (
      select 1 from public.claims c
      where c.person_id = p_person and c.claimant_user_id is distinct from p_user
    );
$$;

revoke all on function private.is_own_placeholder(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The claim: only a placeholder merges, and never into the dead
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
  v_died boolean;
  v_recent int;
  v_name_ok boolean;
  v_claim_id uuid;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if v_self is null then
    raise exception 'Add your own entry before claiming another' using errcode = '42501';
  end if;
  if p_person_id = v_self then
    raise exception 'That is already your entry';
  end if;

  -- Claiming merges the member's own entry into this one and deletes it
  -- (below), which is only safe for a placeholder they made for themselves.
  -- An entry a relative made and they claimed, or one others have built on,
  -- is them on the tree: merging it would move their family onto whoever
  -- this is and delete them (Step 36).
  if not private.is_own_placeholder(v_self, v_uid) then
    raise exception 'Only a placeholder you added for yourself can be merged into another entry'
      using errcode = '42501';
  end if;

  select created_by, is_deceased or date_of_death is not null
    into v_creator, v_died
  from public.people where id = p_person_id;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;

  -- Both entries must sit on one tree the claimant belongs to.
  select pl.tree_id into v_tree
  from public.tree_placements pl
  join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = v_uid
  where pl.person_id = p_person_id and pl.status = 'active' and private.is_placed(pl.tree_id, v_self)
  limit 1;
  if v_tree is null then
    raise exception 'That entry is on a different tree';
  end if;

  -- Someone who has died is nobody's own entry (Step 36).
  if v_died then
    raise exception 'That entry is marked as having died' using errcode = '42501';
  end if;

  if private.person_is_claimed(p_person_id) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;
  if exists (select 1 from public.profiles where self_person_id = p_person_id) then
    raise exception 'That entry already belongs to a member' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  select
    lower(btrim(pe.last_name)) = lower(btrim(s.last_name))
    and (
      (nullif(btrim(s.first_name), '') is not null
       and lower(btrim(s.first_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      or
      (nullif(btrim(s.preferred_name), '') is not null
       and lower(btrim(s.preferred_name)) in (
         lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
    )
    into v_name_ok
  from public.people pe, public.people s
  where pe.id = p_person_id and s.id = v_self;

  if not coalesce(v_name_ok, false) and not private.person_invited_to_claim(p_person_id) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  -- Move the placeholder's lines onto the claimed entry, dropping any that
  -- would double up or point at itself.
  delete from public.relationships r
  where (r.from_person = v_self or r.to_person = v_self)
    and (
      (case when r.from_person = v_self then p_person_id else r.from_person end)
        = (case when r.to_person = v_self then p_person_id else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
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

  update public.documents set person_id = p_person_id where person_id = v_self;
  update public.entry_comments set person_id = p_person_id where person_id = v_self;
  -- The placeholder's placements come along where the claimed entry has none.
  insert into public.tree_placements (tree_id, person_id, status, placed_by, responded_at)
  select pl.tree_id, p_person_id, pl.status, pl.placed_by, pl.responded_at
  from public.tree_placements pl
  where pl.person_id = v_self
  on conflict (tree_id, person_id) do nothing;
  -- So do its companions, on every tree the claimed entry is on (a pet's
  -- people must be on its tree), staying their pet's first person where the
  -- placeholder was; deleting it would otherwise unlink them, and delete a
  -- pet it was the only person of.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_person_id, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = v_self and private.is_placed(pt.tree_id, p_person_id)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_person_id
  where pt.primary_person_id = v_self
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_person_id
    );
  -- And a bloodline it anchors: a founder's own entry anchors their tree's.
  update public.bloodline_anchors a
  set person_id = p_person_id
  where a.person_id = v_self
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_person_id
    );
  update public.people tgt
  set photo_path = stub.photo_path
  from public.people stub
  where tgt.id = p_person_id and stub.id = v_self
    and tgt.photo_path is null and stub.photo_path is not null;

  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;
  update public.people set owner_user_id = v_uid where id = p_person_id;

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.',
    v_tree
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The card: offered only where the claim would go through
-- ---------------------------------------------------------------------------
create or replace function public.person_claim_candidates()
returns setof public.people
language sql
security definer
set search_path = ''
as $$
  with me as (
    select self.*
    from public.profiles p
    join public.people self on self.id = p.self_person_id
    where p.auth_user_id = (select auth.uid())
      -- Claiming merges this entry away, so only a placeholder is offered
      -- anything (Step 36), as `claim_person` requires.
      and private.is_own_placeholder(self.id, (select auth.uid()))
  ),
  unclaimed as (
    select distinct pe.*
    from public.people pe
    join public.tree_placements pl on pl.person_id = pe.id and pl.status = 'active'
    join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = (select auth.uid())
    cross join me
    where pe.id <> me.id
      and private.is_placed(pl.tree_id, me.id)
      and pe.owner_user_id = pe.created_by
      -- Nobody is someone who has died (Step 36).
      and pe.is_deceased is not true
      and pe.date_of_death is null
      and not exists (select 1 from public.profiles p where p.self_person_id = pe.id)
      and not exists (
        select 1 from public.claims c where c.person_id = pe.id and c.status = 'approved'
      )
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.claimant_user_id = (select auth.uid()) and c.status = 'disputed'
      )
  )
  select u.*
  from unclaimed u, me
  where
    (
      lower(btrim(u.last_name)) = lower(btrim(me.last_name))
      and (
        (nullif(btrim(me.first_name), '') is not null
         and lower(btrim(me.first_name)) in (
           lower(btrim(coalesce(u.first_name, ''))), lower(btrim(coalesce(u.preferred_name, '')))))
        or
        (nullif(btrim(me.preferred_name), '') is not null
         and lower(btrim(me.preferred_name)) in (
           lower(btrim(coalesce(u.first_name, ''))), lower(btrim(coalesce(u.preferred_name, '')))))
      )
    )
    or private.person_invited_to_claim(u.id);
$$;
