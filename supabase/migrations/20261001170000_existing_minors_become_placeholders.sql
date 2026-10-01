-- Step 98.3: existing minors become placeholders.
--
-- Aalim (2026-10-01): the living children under 18 added by someone other
-- than their parent "turn into placeholders and prompt their parent to give
-- permission on what to reveal, if anything". Their details are held back,
-- not deleted; only the parent chooses what the family sees. A Root, a
-- Branch or the parent may still invite the child to claim the entry: it
-- becomes theirs, and they see their own held-back details, but it stays a
-- placeholder to everyone else until the parent shows it.
--   * `private.withheld_details`: a placeholder's held-back details, the old
--     column values as jsonb, read only through `withheld_details` (the
--     parent, or the child once it's their own entry).
--   * `reveal_withheld_details(person, show)`: the parent copies back what
--     they tick (their name always among it: an entry needs one); it's an
--     ordinary entry from then on, theirs, or the child's if they claimed it.
--     `forget_withheld_details(person)`: the parent drops them for good.
--   * `people_before_write`: a parent filling in a placeholder the child has
--     claimed leaves it the child's; a placeholder that stops being one
--     takes its held-back details with it.
--   * `placeholder_entry_guard` covers `story_credits` too.
--   * Claim invites to a placeholder (`can_invite_to_claim_on`, the guard):
--     a Root or a Branch of the tree, or the parent; claimed only through
--     such an invite (its vouch). `merge_invited_entry` never folds a
--     placeholder into someone's entry. A member parent is told when the
--     child claims it (`placeholder_child`).
--   * `seed_self_email`: a child's address isn't seeded onto their
--     placeholder.
--   * `tell_placeholder_parent`: a parent joining is told the details are
--     held back, where they are.
--   * The data: the living minors whose maker isn't their parent become
--     placeholders, numbered per parent eldest first; notices and "Sent
--     invites" records that named them now name the placeholder.

create table private.withheld_details (
  person_id uuid primary key references public.people (id) on delete cascade,
  details jsonb not null check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

alter table private.withheld_details enable row level security;
revoke all on table private.withheld_details from public, anon, authenticated;

comment on table private.withheld_details is
  'Step 98.3: a placeholder child''s held-back details (old people columns as jsonb), read by the parent and the child through withheld_details; the parent shows them (reveal_withheld_details) or drops them (forget_withheld_details).';

-- What's held back of a placeholder, for its parent or the child themself;
-- null for anyone else, or when nothing is.
create or replace function public.withheld_details(p_person uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select w.details
  from private.withheld_details w
  where w.person_id = p_person
    and private.is_placeholder(p_person)
    and (private.is_own_child(p_person) or p_person = private.self_person_id());
$$;

-- The parent shows the family what they tick of a placeholder's held-back
-- details: 'name' (always), 'birth', 'birthplace', 'sex', 'email', 'photo'.
-- The rest is dropped with the placeholder (`people_before_write`).
create or replace function public.reveal_withheld_details(p_person uuid, p_show text[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_show text[] := coalesce(p_show, '{}');
  d jsonb;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_placeholder(p_person) or not private.is_own_child(p_person) then
    raise exception 'PLACEHOLDER: only their parent chooses what to show'
      using errcode = '42501';
  end if;
  if not v_show <@ array['name', 'birth', 'birthplace', 'sex', 'email', 'photo'] then
    raise exception 'REVEAL: unknown details %', v_show using errcode = '22023';
  end if;
  if not 'name' = any(v_show) then
    raise exception 'REVEAL_NAME: show their name too' using errcode = '22023';
  end if;

  select w.details into d
  from private.withheld_details w
  where w.person_id = p_person
  for update;
  if d is null then
    raise exception 'PLACEHOLDER: nothing is held back' using errcode = 'P0002';
  end if;

  update public.people pe set
    first_name = d ->> 'first_name',
    middle_name = d ->> 'middle_name',
    preferred_name = d ->> 'preferred_name',
    maiden_name = d ->> 'maiden_name',
    last_name = coalesce(d ->> 'last_name', ''),
    date_of_birth = case when 'birth' = any(v_show) then (d ->> 'date_of_birth')::date end,
    date_of_birth_precision = case
      when 'birth' = any(v_show) and d ? 'date_of_birth_precision'
        then d ->> 'date_of_birth_precision'
      else pe.date_of_birth_precision
    end,
    date_of_birth_circa = 'birth' = any(v_show)
      and coalesce((d ->> 'date_of_birth_circa')::boolean, false),
    birth_month = case when 'birth' = any(v_show) then (d ->> 'birth_month')::smallint end,
    birth_day = case when 'birth' = any(v_show) then (d ->> 'birth_day')::smallint end,
    city_of_birth = case when 'birthplace' = any(v_show) then d ->> 'city_of_birth' end,
    country_of_birth = case
      when 'birthplace' = any(v_show) then coalesce(d ->> 'country_of_birth', '')
      else ''
    end,
    place_id_birth = case when 'birthplace' = any(v_show) then (d ->> 'place_id_birth')::bigint end,
    sex = case when 'sex' = any(v_show) then d ->> 'sex' end,
    email = case when 'email' = any(v_show) then d ->> 'email' end,
    email_visible = case
      when 'email' = any(v_show) and d ? 'email_visible'
        then (d ->> 'email_visible')::boolean
      else pe.email_visible
    end,
    photo_path = case when 'photo' = any(v_show) then d ->> 'photo_path' end,
    photo_crop = case when 'photo' = any(v_show) then d -> 'photo_crop' end,
    placeholder_number = null,
    -- Theirs, as a fill-in makes it, unless the child has claimed it.
    owner_user_id = case
      when private.person_owner_member(p_person) is null then v_uid
      else pe.owner_user_id
    end
  where pe.id = p_person;
end;
$$;

-- The parent drops a placeholder's held-back details for good.
create or replace function public.forget_withheld_details(p_person uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_placeholder(p_person) or not private.is_own_child(p_person) then
    raise exception 'PLACEHOLDER: only their parent chooses what to show'
      using errcode = '42501';
  end if;
  delete from private.withheld_details where person_id = p_person;
end;
$$;

revoke all on function public.withheld_details(uuid) from public, anon;
revoke all on function public.reveal_withheld_details(uuid, text[]) from public, anon;
revoke all on function public.forget_withheld_details(uuid) from public, anon;
grant execute on function public.withheld_details(uuid) to authenticated;
grant execute on function public.reveal_withheld_details(uuid, text[]) to authenticated;
grant execute on function public.forget_withheld_details(uuid) to authenticated;

CREATE OR REPLACE FUNCTION private.people_before_write()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := (select auth.uid());
    end if;
    if new.owner_user_id is null then
      new.owner_user_id := new.created_by;
    end if;
    if (select auth.uid()) is not null and not private.is_root_of(new.tree_id) then
      new.lineage_type := null;
    end if;
  elsif tg_op = 'UPDATE' then
    if (select auth.uid()) is not null
       and not private.is_root_of(new.tree_id)
       and new.lineage_type is distinct from old.lineage_type then
      raise exception 'lineage_type can only be changed by a Root' using errcode = '42501';
    end if;
    if new.tree_id is distinct from old.tree_id
       and coalesce(current_setting('ancestree.privileged_profile_write', true), '') <> 'on'
       and (select auth.uid()) is not null then
      raise exception 'HOME_TREE: change a home tree through set_home_tree' using errcode = '42501';
    end if;
    -- Placeholder children (Step 98.2): the number is given only by
    -- `add_placeholder_child` and never changed. Their parent's edit that
    -- gives one any detail clears it and makes the entry theirs, unless the
    -- child has claimed it (Step 98.3).
    if new.placeholder_number is distinct from old.placeholder_number
       and new.placeholder_number is not null
       and (select auth.uid()) is not null then
      raise exception 'PLACEHOLDER: a placeholder keeps its number'
        using errcode = '42501';
    end if;
    if old.placeholder_number is not null
       and new.placeholder_number is not null
       and (select auth.uid()) is not null
       and
       (new.first_name, new.middle_name, new.preferred_name, new.maiden_name,
        new.last_name, new.date_of_birth, new.birth_month, new.birth_day,
        new.city_of_birth, new.country_of_birth, new.place_id_birth,
        new.is_deceased, new.date_of_death, new.place_of_death,
        new.place_id_death, new.sex, new.lineage_type, new.photo_path,
        new.photo_crop, new.email)
       is distinct from
       (old.first_name, old.middle_name, old.preferred_name, old.maiden_name,
        old.last_name, old.date_of_birth, old.birth_month, old.birth_day,
        old.city_of_birth, old.country_of_birth, old.place_id_birth,
        old.is_deceased, old.date_of_death, old.place_of_death,
        old.place_id_death, old.sex, old.lineage_type, old.photo_path,
        old.photo_crop, old.email) then
      if not private.is_own_child(new.id) then
        raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
          using errcode = '42501';
      end if;
      new.placeholder_number := null;
      if private.person_owner_member(new.id) is null then
        new.owner_user_id := (select auth.uid());
      end if;
    end if;
    -- What was held back of it goes with the placeholder (Step 98.3).
    if old.placeholder_number is not null and new.placeholder_number is null then
      delete from private.withheld_details where person_id = new.id;
    end if;
    -- A living child's date of birth under 18 is their parent's to give
    -- (Step 98), or their own; anyone else's edit, fill, accepted
    -- suggestion or undo that sets one is refused.
    if (select auth.uid()) is not null
       and (new.date_of_birth, new.date_of_birth_precision, new.is_deceased, new.date_of_death)
           is distinct from
           (old.date_of_birth, old.date_of_birth_precision, old.is_deceased, old.date_of_death)
       and not new.is_deceased and new.date_of_death is null
       and private.birth_age(new.date_of_birth, new.date_of_birth_precision) = 'minor'
       and new.id is distinct from private.self_person_id()
       and not private.is_own_child(new.id) then
      raise exception 'MINOR: % is under 18; only their parent can give that date of birth',
        coalesce(nullif(private.person_label(new.id), ''), 'Someone')
        using errcode = '42501';
    end if;
  end if;
  -- A rough date needs its date (Step 81): when the date goes, circa goes.
  if new.date_of_birth is null then
    new.date_of_birth_circa := false;
  end if;
  if new.date_of_death is null then
    new.date_of_death_circa := false;
  end if;
  return new;
end;
$function$;

-- A child claiming their placeholder (Step 98.3) keeps it empty: their
-- address isn't seeded onto it, as it is onto any other entry of their own.
CREATE OR REPLACE FUNCTION private.seed_self_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.self_person_id is not null
     and (tg_op = 'INSERT' or old.self_person_id is distinct from new.self_person_id) then
    update public.people pe
    set email = lower(u.email)
    from auth.users u
    where pe.id = new.self_person_id
      and pe.email is null
      and pe.placeholder_number is null
      and u.id = new.auth_user_id
      and u.email is not null;
  end if;
  return new;
end;
$function$;

-- Nobody but a placeholder's parent tells a story about it, credits it with
-- one (Step 99's `story_credits`) or tags it in a photo, and nobody suggests
-- a change to it. Since Step 98.3 a Root, a
-- Branch or the parent may invite the child to claim it, and the child
-- claims it only through that invite (the vouch `redeem_invite` writes
-- first); the service role's insert was checked by the app as the inviter.
create or replace function private.placeholder_entry_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.person_id is null or not private.is_placeholder(new.person_id) then
    return new;
  end if;
  if tg_table_name = 'claims' then
    if exists (
      select 1 from private.claim_vouches v
      where v.user_id = new.claimant_user_id and v.person_id = new.person_id
    ) then
      return new;
    end if;
  elsif tg_table_name = 'invites' then
    if (select auth.uid()) is null
       or private.can_invite_to_claim_on(new.tree_id, new.person_id) then
      return new;
    end if;
  elsif tg_table_name in ('stories', 'album_tags', 'story_credits') then
    if private.is_own_child(new.person_id) then
      return new;
    end if;
  end if;
  raise exception 'PLACEHOLDER: only their parent fills in a placeholder'
    using errcode = '42501';
end;
$$;

create trigger story_credits_placeholder_guard
  before insert on public.story_credits
  for each row execute function private.placeholder_entry_guard();

CREATE OR REPLACE FUNCTION private.can_invite_to_claim_on(p_tree uuid, p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(
    private.is_placed(p_tree, p_person_id)
    and (
      (private.is_tree_member(p_tree) and private.can_invite_to_claim(p_person_id))
      or (
        private.is_root_of(p_tree)
        and private.person_is_claimable(p_person_id)
        and exists (
          select 1 from public.people pe
          where pe.id = p_person_id
            and not pe.is_deceased and pe.date_of_death is null
        )
      )
      -- A placeholder child (Step 98.3): a Root or a Branch of the tree, or
      -- its parent, may invite the child to claim it. It stays a
      -- placeholder until the parent shows it.
      or (
        private.is_placeholder(p_person_id)
        and private.person_is_claimable(p_person_id)
        and private.is_tree_member(p_tree)
        and (
          private.role_in(p_tree) in ('admin', 'branch_admin')
          or private.is_own_child(p_person_id)
        )
      )
    ),
    false
  );
$function$;

-- A placeholder child is never folded into anyone's entry (Step 98.3).
CREATE OR REPLACE FUNCTION private.merge_invited_entry(p_invited uuid, p_own uuid, p_tree uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_invited public.people;
  v_own public.people;
begin
  select * into v_invited from public.people where id = p_invited;
  select * into v_own from public.people where id = p_own;
  if v_invited.id is null or v_own.id is null or p_invited = p_own
     or not exists (
       select 1 from public.profiles pr
       where pr.auth_user_id = v_uid and pr.self_person_id = p_own
     ) then
    return false;
  end if;

  -- Someone who has died is nobody's own entry (Steps 36 and 37).
  if v_invited.is_deceased or v_invited.date_of_death is not null
     or v_own.is_deceased or v_own.date_of_death is not null then
    return false;
  end if;

  -- A placeholder child (Step 98.3) is never folded into anyone's entry:
  -- what the family sees of it is its parent's to say.
  if v_invited.placeholder_number is not null then
    return false;
  end if;

  -- A stand-in its maker added and nobody else has built on, spoken for by
  -- nobody, shown on this tree alone: folding it in loses nobody's work and
  -- moves nothing onto a tree they didn't agree to.
  if not private.person_is_claimable(p_invited)
     or not private.is_own_placeholder(p_invited, v_invited.created_by)
     or not private.is_placed(p_tree, p_invited)
     or exists (
       select 1 from public.tree_placements pl
       where pl.person_id = p_invited and pl.tree_id <> p_tree
     ) then
    return false;
  end if;

  -- Plainly someone else: a relative of theirs (a parent with the same name),
  -- or born more than a year apart.
  if exists (
       select 1 from public.relationships r
       where (r.from_person = p_invited and r.to_person = p_own)
          or (r.from_person = p_own and r.to_person = p_invited)
     )
     or abs(extract(year from v_invited.date_of_birth) - extract(year from v_own.date_of_birth)) > 1 then
    return false;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  -- Theirs sits where the invited entry sat on this canvas, unless it's
  -- there already. A placement a Root asked for and they hadn't answered
  -- becomes active, keeping that Root as `placed_by` (as Step 30.9 does).
  if not private.is_placed_in_full(p_tree, p_own) then
    insert into public.tree_placements as tp
      (tree_id, person_id, status, placed_by, responded_at, pos_x, pos_y, pos_dx, pos_dy)
    select p_tree, p_own, 'active', v_uid, now(), pl.pos_x, pl.pos_y, pl.pos_dx, pl.pos_dy
    from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_invited
    on conflict (tree_id, person_id) do update
      set status = 'active', responded_at = now(),
          approval = case when tp.approval = 'none' then 'none' else 'approved' end,
          answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end,
          pos_x = excluded.pos_x, pos_y = excluded.pos_y,
          pos_dx = excluded.pos_dx, pos_dy = excluded.pos_dy;
  end if;

  -- Its lines move onto theirs, dropping any that would double up or point
  -- at itself (as `claim_person` does).
  delete from public.relationships r
  where (r.from_person = p_invited or r.to_person = p_invited)
    and (
      (case when r.from_person = p_invited then p_own else r.from_person end)
        = (case when r.to_person = p_invited then p_own else r.to_person end)
      or exists (
        select 1 from public.relationships r2
        where r2.id <> r.id
          and r2.type = r.type
          and least(r2.from_person, r2.to_person) = least(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
          and greatest(r2.from_person, r2.to_person) = greatest(
            case when r.from_person = p_invited then p_own else r.from_person end,
            case when r.to_person = p_invited then p_own else r.to_person end)
      )
    );

  update public.relationships
  set from_person = case when from_person = p_invited then p_own else from_person end,
      to_person = case when to_person = p_invited then p_own else to_person end
  where from_person = p_invited or to_person = p_invited;

  update public.stories set person_id = p_own where person_id = p_invited;
  -- The credits it holds (Step 99), but for those the other entry holds
  -- already, for the same story and role.
  delete from public.story_credits c
  where c.person_id = p_invited
    and exists (
      select 1 from public.story_credits o
      where o.story_id = c.story_id and o.role = c.role and o.person_id = p_own
    );
  update public.story_credits set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;

  -- Its companions, staying their pet's first person where it was.
  insert into public.pet_companions (pet_id, person_id, created_by, created_at)
  select pc.pet_id, p_own, pc.created_by, pc.created_at
  from public.pet_companions pc
  join public.pets pt on pt.id = pc.pet_id
  where pc.person_id = p_invited and private.is_placed(pt.tree_id, p_own)
  on conflict (pet_id, person_id) do nothing;
  update public.pets pt
  set primary_person_id = p_own
  where pt.primary_person_id = p_invited
    and exists (
      select 1 from public.pet_companions pc
      where pc.pet_id = pt.id and pc.person_id = p_own
    );

  -- And a bloodline it anchors.
  update public.bloodline_anchors a
  set person_id = p_own
  where a.person_id = p_invited
    and not exists (
      select 1 from public.bloodline_anchors b
      where b.tree_id = a.tree_id and b.person_id = p_own
    );

  delete from public.people where id = p_invited;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
  return true;
end;
$function$;

-- A parent told of a placeholder whose details are held back hears so.
create or replace function private.tell_placeholder_parent(p_parent uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_member uuid := private.person_owner_member(p_parent);
  v_child record;
begin
  if v_member is null then
    return;
  end if;
  if exists (
    select 1 from public.people pe
    where pe.id = p_parent and (pe.is_deceased or pe.date_of_death is not null)
  ) then
    return;
  end if;
  for v_child in
    select c.id, c.tree_id, c.created_by, c.placeholder_number
    from public.relationships r
    join public.people c on c.id = r.to_person
    where r.type = 'parent' and r.from_person = p_parent
      and c.placeholder_number is not null
  loop
    continue when exists (
      select 1 from public.notifications n
      where n.recipient_user_id = v_member and n.type = 'placeholder_child'
        and n.person_id = v_child.id
    );
    perform private.notify(
      v_member, v_child.created_by, 'placeholder_child', v_child.id, null,
      case
        -- Details held back from an entry made before Step 98 (98.3).
        when exists (
          select 1 from private.withheld_details w where w.person_id = v_child.id
        ) then
          private.placeholder_label(v_child.placeholder_number)
            || '''s details are hidden from the family. Only you can choose what to show.'
        else
          coalesce(private.member_label(v_child.created_by), 'A Root')
            || ' added a placeholder for your child ('
            || private.placeholder_label(v_child.placeholder_number)
            || '). Only you can fill it in.'
      end,
      v_child.tree_id
    );
  end loop;
end;
$$;

-- A member parent hears when the child claims their placeholder: what the
-- family sees is still theirs to choose.
create or replace function private.placeholder_claimed_tell_parents()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_child public.people;
  v_parent uuid;
  v_member uuid;
begin
  select * into v_child from public.people where id = new.person_id;
  if v_child.placeholder_number is null then
    return null;
  end if;
  for v_parent in
    select r.from_person from public.relationships r
    join public.people pa on pa.id = r.from_person
    where r.type = 'parent' and r.to_person = new.person_id
      and not pa.is_deceased and pa.date_of_death is null
  loop
    v_member := private.person_owner_member(v_parent);
    continue when v_member is null;
    perform private.notify(
      v_member, new.claimant_user_id, 'placeholder_child', new.person_id, new.id,
      private.placeholder_label(v_child.placeholder_number)
        || ' joined. Only you can choose what the family sees.',
      v_child.tree_id
    );
  end loop;
  return null;
end;
$$;

revoke all on function private.placeholder_claimed_tell_parents() from public, anon, authenticated;

create trigger claims_placeholder_claimed
  after insert or update of status on public.claims
  for each row
  when (new.status = 'approved')
  execute function private.placeholder_claimed_tell_parents();

-- The data: every living child under 18 that nobody has claimed and whose
-- maker's own entry isn't among their parents becomes a placeholder, eldest
-- first per parent, numbered after that parent's waiting placeholders.
do $$
declare
  r record;
  v_number smallint;
  v_label text;
  v_ids uuid[] := '{}';
  v_parents uuid[] := '{}';
  v_parent uuid;
  v_bad int;
begin
  for r in
    select pe.*, private.person_label(pe.id) as old_label
    from public.people pe
    where pe.placeholder_number is null
      and not pe.is_deceased and pe.date_of_death is null
      and private.birth_age(pe.date_of_birth, pe.date_of_birth_precision) = 'minor'
      and private.person_owner_member(pe.id) is null
      and exists (
        select 1 from public.relationships rp
        where rp.type = 'parent' and rp.to_person = pe.id
      )
      and not exists (
        select 1 from public.relationships rp
        join public.profiles pr on pr.self_person_id = rp.from_person
        where rp.type = 'parent' and rp.to_person = pe.id
          and pr.auth_user_id = pe.created_by
      )
    order by pe.date_of_birth, pe.created_at
  loop
    -- Nothing here keeps a file, a story, a tag or a lineage; were it to,
    -- this would need more than columns held back.
    if r.photo_path is not null or r.lineage_type is not null
       or exists (select 1 from public.stories s where s.person_id = r.id)
       or exists (select 1 from public.album_tags t where t.person_id = r.id) then
      raise exception 'Step 98.3: % has more than details to hold back', r.id;
    end if;

    insert into private.withheld_details (person_id, details)
    values (
      r.id,
      jsonb_strip_nulls(jsonb_build_object(
        'first_name', r.first_name,
        'middle_name', r.middle_name,
        'preferred_name', r.preferred_name,
        'maiden_name', r.maiden_name,
        'last_name', nullif(r.last_name, ''),
        'date_of_birth', r.date_of_birth,
        'date_of_birth_precision',
          case when r.date_of_birth is not null then r.date_of_birth_precision end,
        'date_of_birth_circa', nullif(r.date_of_birth_circa, false),
        'birth_month', r.birth_month,
        'birth_day', r.birth_day,
        'city_of_birth', nullif(r.city_of_birth, ''),
        'country_of_birth', nullif(r.country_of_birth, ''),
        'place_id_birth', r.place_id_birth,
        'sex', r.sex,
        'email', r.email,
        'email_visible', case when r.email is not null then r.email_visible end
      ))
    );

    select coalesce(max(c.placeholder_number), 0) + 1 into v_number
    from public.relationships rp
    join public.people c on c.id = rp.to_person
    where rp.type = 'parent'
      and rp.from_person in (
        select rq.from_person from public.relationships rq
        where rq.type = 'parent' and rq.to_person = r.id
      )
      and c.placeholder_number is not null;
    v_label := private.placeholder_label(v_number);

    update public.people set
      first_name = null, middle_name = null, preferred_name = null,
      maiden_name = null, last_name = '', date_of_birth = null,
      date_of_birth_circa = false, birth_month = null, birth_day = null,
      city_of_birth = null, country_of_birth = '', place_id_birth = null,
      sex = null, email = null, photo_crop = null,
      placeholder_number = v_number
    where id = r.id;

    -- Notices that named them name the placeholder now.
    update public.notifications
    set body = replace(body, r.old_label, v_label)
    where person_id = r.id and position(r.old_label in body) > 0;
    -- So do the Roots' "Sent invites" records of invites to claim it.
    update public.invite_requests ir
    set first_name = regexp_replace(v_label, ' [^ ]+$', ''),
        last_name = regexp_replace(v_label, '^.* ', '')
    from public.invites i
    where i.id = ir.invite_id and i.person_id = r.id;

    v_ids := v_ids || r.id;
  end loop;

  -- Holding them back is no edit for anyone to be told of.
  delete from public.notifications
  where person_id = any(v_ids) and type = 'entry_updated'
    and created_at = now();

  -- Nothing stored about them still names them.
  select count(*) into v_bad
  from public.notifications n
  join private.withheld_details w on w.person_id = n.person_id
  where n.person_id = any(v_ids)
    and (
      n.body ~ ('\m' || regexp_replace(coalesce(w.details ->> 'first_name', '~'), '([^[:alnum:] ])', '\\\1', 'g') || '\M')
      or n.body ~ ('\m' || regexp_replace(coalesce(w.details ->> 'preferred_name', '~'), '([^[:alnum:] ])', '\\\1', 'g') || '\M')
    );
  if v_bad > 0 then
    raise exception 'Step 98.3: % notices still name them', v_bad;
  end if;

  -- Their parents who are members hear of it.
  select coalesce(array_agg(distinct rp.from_person), '{}') into v_parents
  from public.relationships rp
  where rp.type = 'parent' and rp.to_person = any(v_ids);
  foreach v_parent in array v_parents loop
    perform private.tell_placeholder_parent(v_parent);
  end loop;

  raise notice 'Step 98.3: % entries became placeholders', cardinality(v_ids);
end;
$$;
