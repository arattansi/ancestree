-- Step 83 — Carried lines: claiming a basic card, a reminder, asks that lapse
--
-- Step 80 left three gaps, closed here:
--
--   * Someone new to a tree couldn't say a basic card was them until it was
--     approved, so they'd add themselves again. Now "This is me" works on a
--     basic card as on any other: their name has to match what the card
--     shows, whoever added the entry is told and can dispute it, and
--     claiming it on that tree is their yes to showing it there in full. A
--     claim a Root reverses closes the card again.
--   * Nothing reminded anyone who hadn't answered. Now each ask gets one
--     reminder, by email, after 7 days.
--   * Asks never lapsed. Now one lapses 30 days after it was asked, as a
--     relay ask does (Step 41.5): the card stays basic, whoever was asked
--     can still say yes, and the Root who asked is told and can ask again.
--
-- No scheduler (pg_cron was declined in Step 41.5). A lapse is read off
-- `asked_at`, so it holds whether or not anything ran; the reminder and the
-- notice of a lapse go out the next time the asking tree is opened, which
-- `tree_people.nudge_due` tells the app, and `run_placement_nudges` hands
-- each out once.
--
-- Safe under the code that was live when this was applied: every function
-- keeps its name, arguments and columns, `tree_people` gains one column at
-- its end, and live had nobody waiting on an answer.

-- ---------------------------------------------------------------------------
-- 1. When an ask was last chased
-- ---------------------------------------------------------------------------
alter table public.tree_placements
  add column reminded_at timestamptz,
  add column lapse_told_at timestamptz;

-- As `20260929090000_carry_a_family_line`, with the two new columns held.
create or replace function private.tree_placements_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home uuid;
  v_privileged boolean :=
    coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on'
    or (select auth.uid()) is null;
  v_placer_gone boolean;
  v_answerer_gone boolean;
begin
  if tg_op = 'DELETE' then
    select tree_id into v_home from public.people where id = old.person_id;
    if v_home = old.tree_id
       and exists (select 1 from public.trees t where t.id = old.tree_id) then
      raise exception 'HOME_PLACEMENT: change the home tree first' using errcode = '42501';
    end if;
    return old;
  end if;

  if not v_privileged then
    -- Whoever placed the card, or answered for it, is going: deleting their
    -- profile clears the link (on delete set null) as whoever deleted it, for
    -- remove_tree_member a Root who may not be on this tree.
    v_placer_gone :=
      old.placed_by is not null and new.placed_by is null
      and not exists (select 1 from public.profiles p where p.auth_user_id = old.placed_by);
    v_answerer_gone :=
      old.answered_by is not null and new.answered_by is null
      and not exists (select 1 from public.profiles p where p.auth_user_id = old.answered_by);

    if new.tree_id <> old.tree_id or new.person_id <> old.person_id
       or new.status <> old.status
       or new.responded_at is distinct from old.responded_at
       or new.approval <> old.approval
       or new.asked_at is distinct from old.asked_at
       or new.reminded_at is distinct from old.reminded_at
       or new.lapse_told_at is distinct from old.lapse_told_at
       or (new.placed_by is distinct from old.placed_by and not v_placer_gone)
       or (new.answered_by is distinct from old.answered_by and not v_answerer_gone) then
      raise exception 'Only a card''s position can be changed here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- What a tree shows of an ask today: 'lapsed' once it has waited 30 days.
-- The row keeps 'asked', so an answer is still taken.
create or replace function private.placement_approval_now(
  p_approval text, p_asked_at timestamptz
)
returns text
language sql
stable
set search_path = ''
as $$
  select case
    when p_approval = 'asked' and p_asked_at <= now() - interval '30 days' then 'lapsed'
    else p_approval
  end;
$$;

-- Whether an ask has something to send: its one reminder, from 7 days, or
-- word of its lapse, from 30.
create or replace function private.placement_nudge_due(
  p_approval text,
  p_asked_at timestamptz,
  p_reminded_at timestamptz,
  p_lapse_told_at timestamptz
)
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    p_approval = 'asked'
    and case
          when p_asked_at <= now() - interval '30 days' then p_lapse_told_at is null
          when p_asked_at <= now() - interval '7 days' then p_reminded_at is null
          else false
        end,
    false
  );
$$;

revoke all on function
  private.placement_approval_now(text, timestamptz),
  private.placement_nudge_due(text, timestamptz, timestamptz, timestamptz)
  from public, anon;
grant execute on function
  private.placement_approval_now(text, timestamptz),
  private.placement_nudge_due(text, timestamptz, timestamptz, timestamptz)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The tree views: a lapsed ask, and whether there is anything to send
-- ---------------------------------------------------------------------------
-- As `20260929090000_carry_a_family_line`; `nudge_due` is new, at the end.
create or replace view private.basic_tree_people
with (security_invoker = false) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  pl.person_id as id,
  private.placement_approval_now(pl.approval, pl.asked_at) as approval,
  pl.detail,
  s.shown,
  case when s.shown then pe.tree_id end as home_tree_id,
  case when s.shown then pe.first_name end as first_name,
  case when s.shown then pe.preferred_name end as preferred_name,
  case when s.shown then pe.last_name end as last_name,
  case when s.shown then pe.city_of_birth end as city_of_birth,
  case when s.shown then pe.country_of_birth end as country_of_birth,
  case when s.shown then pe.place_id_birth end as place_id_birth,
  case
    when private.person_owner_member(pl.person_id) is not null then 'owner'
    else 'stewards'
  end as asked_of,
  private.placement_nudge_due(
    pl.approval, pl.asked_at, pl.reminded_at, pl.lapse_told_at
  ) as nudge_due
from public.tree_placements pl
join public.people pe on pe.id = pl.person_id
cross join lateral (
  -- Hidden from visitors holds for a basic card too.
  select
    not pe.hidden_from_visitors
    or private.is_tree_member(pl.tree_id)
    or coalesce((select auth.role()), '') = 'service_role' as shown
) s
where pl.status = 'active'
  and pl.detail = 'basic'
  and (
    private.can_view_tree(pl.tree_id)
    or coalesce((select auth.role()), '') = 'service_role'
  );

create or replace view public.tree_people
with (security_invoker = true) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  (pe.tree_id = pl.tree_id) as is_home,
  pl.person_id as id,
  pe.tree_id as home_tree_id,
  pe.first_name,
  pe.middle_name,
  pe.preferred_name,
  pe.maiden_name,
  pe.last_name,
  pe.date_of_birth,
  pe.date_of_death,
  pe.date_of_birth_precision,
  pe.date_of_death_precision,
  pe.city_of_birth,
  pe.country_of_birth,
  pe.place_id_birth,
  pe.place_id_death,
  pe.is_deceased,
  pe.place_of_death,
  pe.sex,
  pe.lineage_type,
  pe.photo_path,
  pe.photo_crop,
  pe.owner_user_id,
  pe.created_by,
  pe.hidden_from_visitors,
  pe.created_at,
  pe.updated_at,
  (pe.id is null) as blurred,
  -- Shown to other members only when the person says so; otherwise it is
  -- the entry's owner's alone — not even a Root's.
  case
    when pe.id is not null and (pe.email_visible or pe.owner_user_id = (select auth.uid())) then pe.email
  end as email,
  pe.email_visible,
  pe.birth_month,
  pe.birth_day,
  pe.date_of_birth_circa,
  pe.date_of_death_circa,
  pl.detail,
  pl.approval,
  null::text as asked_of,
  false as nudge_due
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active' and pl.detail = 'full'
union all
select
  b.tree_id,
  b.placement_id,
  b.placement_status,
  b.pos_x,
  b.pos_y,
  b.pos_dx,
  b.pos_dy,
  false as is_home,
  b.id,
  b.home_tree_id,
  b.first_name,
  null::text as middle_name,
  b.preferred_name,
  null::text as maiden_name,
  b.last_name,
  null::date as date_of_birth,
  null::date as date_of_death,
  null::text as date_of_birth_precision,
  null::text as date_of_death_precision,
  b.city_of_birth,
  b.country_of_birth,
  b.place_id_birth,
  null::bigint as place_id_death,
  null::boolean as is_deceased,
  null::text as place_of_death,
  null::text as sex,
  null::text as lineage_type,
  null::text as photo_path,
  null::jsonb as photo_crop,
  null::uuid as owner_user_id,
  null::uuid as created_by,
  (not b.shown) as hidden_from_visitors,
  null::timestamptz as created_at,
  null::timestamptz as updated_at,
  (not b.shown) as blurred,
  null::text as email,
  null::boolean as email_visible,
  null::smallint as birth_month,
  null::smallint as birth_day,
  false as date_of_birth_circa,
  false as date_of_death_circa,
  b.detail,
  b.approval,
  b.asked_of,
  b.nudge_due
from private.basic_tree_people b;

-- ---------------------------------------------------------------------------
-- 3. Claiming a basic card
-- ---------------------------------------------------------------------------
-- How well a typed name matches what a basic card shows. As
-- `private.self_candidate_score`, without the maiden name a basic card
-- keeps back.
create or replace function private.basic_candidate_score(
  p_person_id uuid,
  p_first text,
  p_last text
)
returns real
language sql
stable
set search_path = ''
as $$
  select case
    when f >= 0.4 and l >= 0.4 and (f + l) / 2 >= 0.55 then (f + l) / 2
    else null
  end
  from (
    select
      greatest(
        private.name_score(p_first, pe.first_name),
        private.name_score(p_first, pe.preferred_name)
      ) as f,
      private.name_score(p_last, pe.last_name) as l
    from public.people pe
    where pe.id = p_person_id
  ) parts;
$$;

-- An entry just claimed shows in full on these trees, where it was a basic
-- card: the claim is its owner's yes. Whoever brought it over is told.
create or replace function private.claimed_shows_in_full(
  p_person uuid, p_trees uuid[], p_claimant uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_who text := coalesce(private.member_label(p_claimant), 'A relative');
  v_row record;
begin
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  for v_row in
    update public.tree_placements pl
    set approval = 'approved', answered_by = p_claimant, responded_at = now()
    where pl.person_id = p_person
      and pl.tree_id = any (coalesce(p_trees, '{}'))
      and pl.status = 'active'
      and pl.approval in ('asked', 'declined')
    returning pl.tree_id, pl.placed_by
  loop
    perform private.notify(
      v_row.placed_by, p_claimant, 'placement_accepted', p_person, null,
      v_who || ' claimed their entry, so it shows in full on '
        || coalesce((select t.name from public.trees t where t.id = v_row.tree_id), 'your tree')
        || '.',
      v_row.tree_id
    );
  end loop;
  perform set_config('ancestree.privileged_profile_write', v_was, true);
end;
$$;

-- A claim reversed: the cards it opened are basic again, and whoever may
-- edit the entry is asked afresh.
create or replace function private.claim_undone_shows_basic(
  p_person uuid, p_claimant uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_row record;
begin
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  for v_row in
    update public.tree_placements pl
    set approval = 'asked', asked_at = now(), answered_by = null,
        responded_at = null, reminded_at = null, lapse_told_at = null
    where pl.person_id = p_person
      and pl.answered_by = p_claimant
      and pl.approval = 'approved'
      and pl.tree_id <> private.home_tree(p_person)
    returning pl.tree_id, pl.placed_by
  loop
    perform private.ask_about_placements(v_row.tree_id, array[p_person], v_row.placed_by);
  end loop;
  perform set_config('ancestree.privileged_profile_write', v_was, true);
end;
$$;

revoke all on function
  private.basic_candidate_score(uuid, text, text),
  private.claimed_shows_in_full(uuid, uuid[], uuid),
  private.claim_undone_shows_basic(uuid, uuid)
  from public, anon, authenticated;

-- Onboarding's search. As `20260929090000_carry_a_family_line`, a basic
-- card among what it finds, as the card shows it: no maiden name, no
-- dates, and of its parents only those this tree draws.
create or replace function public.search_self_candidates(
  p_first text, p_last text, p_tree uuid default null
)
returns table (
  id uuid,
  first_name text,
  preferred_name text,
  last_name text,
  maiden_name text,
  date_of_birth date,
  date_of_death date,
  is_deceased boolean,
  city_of_birth text,
  country_of_birth text,
  parent_names text,
  score real
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
  v_named boolean := private.fold_name(p_last) is not null;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_tree_member(v_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  return query
  with candidates as (
    select
      pe.id as person_id,
      f.in_full,
      private.person_invited_to_claim(pe.id) as vouched,
      -- A basic card is matched on what it shows: never a maiden name.
      case
        when not v_named then null
        when f.in_full then private.self_candidate_score(pe.id, p_first, p_last)
        else private.basic_candidate_score(pe.id, p_first, p_last)
      end as name_score
    from public.people pe
    cross join lateral (select private.is_placed_in_full(v_tree, pe.id) as in_full) f
    where private.is_placed(v_tree, pe.id)
      -- Nobody who has died is anyone's own entry, vouched or not (Step 37).
      and pe.is_deceased is not true
      and pe.date_of_death is null
      and private.person_is_claimable(pe.id)
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.claimant_user_id = v_uid and c.status = 'disputed'
      )
  )
  select
    pe.id, pe.first_name, pe.preferred_name, pe.last_name,
    case when ca.in_full then pe.maiden_name end,
    case when ca.in_full then pe.date_of_birth end,
    case when ca.in_full then pe.date_of_death end,
    case when ca.in_full then pe.is_deceased else false end,
    pe.city_of_birth, pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
        -- Of a basic card, only the parents this tree draws.
        and (ca.in_full or private.is_placed(v_tree, r.from_person))
    ) as parent_names,
    case when ca.vouched then 1::real else ca.name_score end as score
  from candidates ca
  join public.people pe on pe.id = ca.person_id
  where ca.vouched or ca.name_score is not null
  order by ca.vouched desc, score desc,
    case when ca.in_full then pe.date_of_birth end asc nulls last
  limit 10;
end;
$$;

-- "This is me" from onboarding. As `20260923070000_claim_invite_claims_on_accept`
-- and `20260929090000_carry_a_family_line`.
create or replace function public.claim_person_as_self(
  p_person_id uuid, p_first text, p_last text, p_tree uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tree uuid := coalesce(p_tree, private.current_tree_id());
begin
  -- The typed name has to match the entry, unless an invite named it for
  -- them: that vouch is the stronger signal (Step 30.2). A basic card is
  -- matched on what it shows (Step 83).
  return private.claim_as_self(
    p_person_id,
    v_tree,
    private.person_invited_to_claim(p_person_id)
      or case
           when private.is_placed_in_full(v_tree, p_person_id)
             then private.self_candidate_score(p_person_id, p_first, p_last)
           else private.basic_candidate_score(p_person_id, p_first, p_last)
         end is not null
  );
end;
$$;

create or replace function private.claim_as_self(
  p_person uuid, p_tree uuid, p_name_ok boolean
)
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
  v_claim_id uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  if not found then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if v_self is not null then
    raise exception 'You already have your own entry' using errcode = '23505';
  end if;
  if not private.is_tree_member(p_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;

  select created_by, is_deceased or date_of_death is not null
    into v_creator, v_died
  from public.people where id = p_person;
  if v_creator is null then
    raise exception 'That entry no longer exists';
  end if;
  if not private.is_placed(p_tree, p_person) then
    raise exception 'That entry is on a different tree';
  end if;
  -- Someone who has died is nobody's own entry (Step 37, as `claim_person`).
  if v_died then
    raise exception 'That entry is marked as having died' using errcode = '42501';
  end if;
  if not private.person_is_claimable(p_person) then
    raise exception 'Someone has already claimed that entry' using errcode = '23505';
  end if;

  select count(*) into v_recent
  from public.claims
  where claimant_user_id = v_uid and created_at > now() - interval '24 hours';
  if v_recent >= 5 then
    raise exception 'Too many claims in the last day. Try again later.' using errcode = '54000';
  end if;

  if not coalesce(p_name_ok, false) then
    raise exception 'That entry does not match your name closely enough to claim' using errcode = '42501';
  end if;

  update public.people set owner_user_id = v_uid where id = p_person;
  update public.profiles set self_person_id = p_person where auth_user_id = v_uid;
  -- Claiming a basic card here is their yes to showing it here (Step 83).
  perform private.claimed_shows_in_full(p_person, array[p_tree], v_uid);

  -- A founding Root claiming their entry anchors their tree's bloodline.
  if private.is_root_of(p_tree) then
    insert into public.bloodline_anchors (tree_id, person_id, created_by)
    values (p_tree, p_person, v_uid)
    on conflict do nothing;
  end if;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person, v_claim_id,
    private.person_label(p_person)
      || ' was claimed by a relative joining the tree. If this looks wrong, you can dispute it.',
    -- In an inbox whoever added the entry has (Step 83).
    case
      when exists (
        select 1 from public.tree_members m
        where m.tree_id = p_tree and m.user_id = v_creator
      ) then p_tree
      else private.home_tree(p_person)
    end
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person);
end;
$$;

-- "This is me" on the canvas, which merges their placeholder into the
-- entry. As `20260929090000_carry_a_family_line`.
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
  -- The placeholder's photo file and where it goes (Step 43).
  v_photo_from text;
  v_photo_to text;
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
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
  where pl.person_id = p_person_id and pl.status = 'active'
    and private.is_placed(pl.tree_id, v_self)
  -- One that shows the whole entry first, if any does.
  order by pl.detail desc
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

  update public.entry_comments set person_id = p_person_id where person_id = v_self;
  -- The placeholder's placements come along where the claimed entry has none.
  insert into public.tree_placements (tree_id, person_id, status, placed_by, responded_at)
  select pl.tree_id, p_person_id, pl.status, pl.placed_by, pl.responded_at
  from public.tree_placements pl
  where pl.person_id = v_self
  on conflict (tree_id, person_id) do nothing;
  -- A basic card of the claimed entry, on a tree their placeholder was on,
  -- shows in full from here: claiming it there is their yes (Step 83).
  perform private.claimed_shows_in_full(
    p_person_id,
    array(
      select pl.tree_id from public.tree_placements pl
      where pl.person_id = v_self and pl.status = 'active'
    ),
    v_uid
  );
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
  -- Its photo, where the claimed entry has none, framed as it was. Storage
  -- lets someone read a photo only if they can see the entry its path names
  -- (`<tree>/<entry>/<file>`), and the placeholder is about to go, so the
  -- claimed entry names the same file under its own id, and `claimPerson`
  -- moves the file there (Step 43). A photo kept anywhere but the
  -- placeholder's own folder stays behind.
  select stub.photo_path,
         split_part(stub.photo_path, '/', 1) || '/' || p_person_id::text || '/'
           || split_part(stub.photo_path, '/', 3)
    into v_photo_from, v_photo_to
  from public.people stub, public.people tgt
  where stub.id = v_self and tgt.id = p_person_id
    and tgt.photo_path is null
    and stub.photo_path ~ ('^[^/]+/' || v_self::text || '/[^/]+$');
  if v_photo_to is not null then
    update public.people tgt
    set photo_path = v_photo_to, photo_crop = stub.photo_crop
    from public.people stub
    where tgt.id = p_person_id and stub.id = v_self;
  end if;

  update public.profiles set self_person_id = p_person_id where auth_user_id = v_uid;
  update public.people set owner_user_id = v_uid where id = p_person_id;

  -- Its documents, now that the claimed entry is theirs. A document changes
  -- entries only inside a merge, under the privileged flag (as
  -- `merge_invited_entry` does), and its tree never changes
  -- (`documents_guard`). It stops being shared across trees: the claimed
  -- entry may be shown on trees the placeholder never was. They can share it
  -- again, as its person (Step 43).
  perform set_config('ancestree.privileged_profile_write', 'on', true);
  update public.documents
  set person_id = p_person_id, shared_across_trees = false
  where person_id = v_self;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  delete from public.people where id = v_self;

  insert into public.claims (person_id, claimant_user_id, status, resolved_at)
  values (p_person_id, v_uid, 'approved', now())
  returning id into v_claim_id;

  perform private.notify(
    v_creator, v_uid, 'claim_approved', p_person_id, v_claim_id,
    private.person_label(p_person_id)
      || ' was claimed by a relative. If this looks wrong, you can dispute it.',
    -- In an inbox whoever added the entry has (Step 83).
    case
      when exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree and m.user_id = v_creator
      ) then v_tree
      else private.home_tree(p_person_id)
    end
  );

  -- `photo_from` and `photo_to` are the move `claimPerson` makes, or null.
  return jsonb_build_object(
    'claim_id', v_claim_id,
    'person_id', p_person_id,
    'photo_from', v_photo_from,
    'photo_to', v_photo_to
  );
end;
$$;

-- "Is this you?" on the canvas. A basic card among them comes back as the
-- card shows it: names and place of birth, the rest empty.
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
    select pe.id, bool_or(pl.detail = 'full') as in_full
    from public.people pe
    join public.tree_placements pl
      on pl.person_id = pe.id and pl.status = 'active'
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
    group by pe.id
  )
  select (
    case
      when u.in_full then pe
      else jsonb_populate_record(
        null::public.people,
        jsonb_build_object(
          'id', pe.id,
          'tree_id', pe.tree_id,
          'first_name', pe.first_name,
          'preferred_name', pe.preferred_name,
          'last_name', pe.last_name,
          'city_of_birth', pe.city_of_birth,
          'country_of_birth', pe.country_of_birth,
          'place_id_birth', pe.place_id_birth,
          'is_deceased', false
        )
      )
    end
  ).*
  from unclaimed u
  join public.people pe on pe.id = u.id
  cross join me
  where
    (
      lower(btrim(pe.last_name)) = lower(btrim(me.last_name))
      and (
        (nullif(btrim(me.first_name), '') is not null
         and lower(btrim(me.first_name)) in (
           lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
        or
        (nullif(btrim(me.preferred_name), '') is not null
         and lower(btrim(me.preferred_name)) in (
           lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      )
    )
    or private.person_invited_to_claim(pe.id);
$$;

-- As `20260922090000_trees_have_members`, closing what the claim opened.
create or replace function public.resolve_claim(p_claim_id uuid, p_action text)
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
  v_tree uuid;
begin
  if p_action not in ('uphold', 'reverse') then
    raise exception 'Unknown action: %', p_action;
  end if;

  select c.person_id, c.claimant_user_id, c.status, pe.created_by, pe.tree_id
    into v_person, v_claimant, v_status, v_creator, v_tree
  from public.claims c
  join public.people pe on pe.id = c.person_id
  where c.id = p_claim_id;

  if v_person is null then
    raise exception 'That claim no longer exists';
  end if;
  if not private.is_root_of(v_tree) then
    raise exception 'Roots only' using errcode = '42501';
  end if;
  if v_status <> 'disputed' then
    raise exception 'Only a disputed claim can be resolved';
  end if;

  if p_action = 'uphold' then
    update public.claims set status = 'approved', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;

    perform private.notify(
      v_claimant, v_uid, 'claim_upheld', v_person, p_claim_id,
      'A Root upheld your claim on ' || private.person_label(v_person) || '.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_upheld', v_person, p_claim_id,
      'A Root upheld the claim on ' || private.person_label(v_person) || '.', v_tree
    );
  else
    update public.claims set status = 'rejected', resolved_at = now(), resolved_by = v_uid
    where id = p_claim_id;
    update public.people set owner_user_id = created_by where id = v_person;
    update public.profiles set self_person_id = null
    where auth_user_id = v_claimant and self_person_id = v_person;
    -- What the claim opened on other trees closes again (Step 83).
    perform private.claim_undone_shows_basic(v_person, v_claimant);

    perform private.notify(
      v_claimant, v_uid, 'claim_reversed', v_person, p_claim_id,
      'A Root reversed your claim on ' || private.person_label(v_person)
        || '. Re-add your own entry from onboarding if needed.', v_tree
    );
    perform private.notify(
      v_creator, v_uid, 'claim_reversed', v_person, p_claim_id,
      'A Root reversed the claim on ' || private.person_label(v_person)
        || '. You have edit rights again.', v_tree
    );
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Asking, asking again, and what is sent while an ask waits
-- ---------------------------------------------------------------------------
-- The notices of an ask, as `place_people` wrote them in Step 80, for it and
-- for asking again: a member about their own entry; for nobody's own
-- entries, one to each person asked, for each tree they're asked about.
create or replace function private.ask_about_placements(
  p_tree uuid, p_person_ids uuid[], p_actor uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tree_name text;
  v_placer text := coalesce(private.member_label(p_actor), 'A Root');
  v_person uuid;
  v_owner uuid;
  v_waiting uuid[] := '{}';
  v_steward record;
begin
  select name into v_tree_name from public.trees where id = p_tree;

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    v_owner := private.person_owner_member(v_person);
    if v_owner is not null then
      perform private.notify(
        v_owner, p_actor, 'placement_requested', v_person, null,
        v_placer || ' would like to show your full entry on '
          || coalesce(v_tree_name, 'their tree') || '.',
        p_tree
      );
    else
      v_waiting := v_waiting || v_person;
    end if;
  end loop;

  -- Nobody's own entries: one notice to each person asked, for each tree
  -- they're asked about, in that tree's inbox.
  for v_steward in
    select
      s.user_id,
      pe.tree_id as home,
      count(*) as entries,
      (array_agg(w.id order by w.ord))[1] as first_person
    from unnest(v_waiting) with ordinality as w(id, ord)
    join public.people pe on pe.id = w.id
    cross join lateral private.placement_stewards(w.id) as s(user_id)
    where s.user_id is distinct from p_actor
    group by s.user_id, pe.tree_id
  loop
    insert into public.notifications
      (recipient_user_id, actor_user_id, type, person_id, body, tree_id)
    values (
      v_steward.user_id, p_actor, 'placements_requested',
      case when v_steward.entries = 1 then v_steward.first_person end,
      v_placer || ' would like to show '
        || case
             when v_steward.entries = 1 then
               coalesce(nullif(private.person_label(v_steward.first_person), ''), 'an entry')
                 || '''s full entry'
             else
               v_steward.entries || ' full entries from '
                 || coalesce((select t.name from public.trees t where t.id = v_steward.home), 'your tree')
           end
        || ' on ' || coalesce(v_tree_name, 'their tree') || '.',
      v_steward.home
    );
  end loop;
end;
$$;

revoke all on function private.ask_about_placements(uuid, uuid[], uuid)
  from public, anon, authenticated;

-- As `20260929090000_carry_a_family_line`, its notices now written by
-- `private.ask_about_placements`.
create or replace function public.place_people(p_tree uuid, p_person_ids uuid[])
returns table (
  placed_person_id uuid,
  placement_status text,
  placement_approval text,
  newly_asked boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_owner uuid;
  v_approval text;
  v_was text;
  v_founder uuid;
  v_self uuid;
  v_outside uuid[];
  v_waiting uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select created_by into v_founder from public.trees where id = p_tree;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    if not private.can_see_person(v_person) then
      raise exception 'You can only bring people you can see on a tree you belong to'
        using errcode = '42501';
    end if;

    v_owner := private.person_owner_member(v_person);
    v_approval := case
      when v_owner = v_uid then 'none'
      when v_owner is not null then 'asked'
      when private.can_edit_person(v_person) then 'none'
      else 'asked'
    end;
    newly_asked := false;

    select tp.approval into v_was
    from public.tree_placements tp
    where tp.tree_id = p_tree and tp.person_id = v_person
    for update;

    if found then
      -- Here already, as they are: nobody is asked twice, and a no stands.
      -- Unless the yes is this Root's own to give.
      if v_was in ('asked', 'declined') and v_approval = 'none' then
        update public.tree_placements
        set approval = 'approved', answered_by = v_uid, responded_at = now()
        where tree_id = p_tree and person_id = v_person;
        v_was := 'approved';
      end if;
      v_approval := v_was;
    else
      insert into public.tree_placements
        (tree_id, person_id, status, placed_by, approval, asked_at, responded_at)
      values (
        p_tree, v_person, 'active', v_uid, v_approval,
        case when v_approval = 'asked' then now() end,
        case when v_approval = 'none' then now() end
      );
      newly_asked := v_approval = 'asked';
    end if;

    -- The founder's own entry, on the tree they founded, is its anchor —
    -- as adding themselves would have made it.
    if v_person = v_self
       and v_founder = v_uid
       and not private.bloodline_gate_active(p_tree) then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (p_tree, v_person, v_uid)
      on conflict do nothing;
    end if;

    if newly_asked then
      v_waiting := v_waiting || v_person;
    end if;

    placed_person_id := v_person;
    placement_status := 'active';
    placement_approval := v_approval;
    return next;
  end loop;

  -- Everyone brought over needs a blood tie here (Step 55), judged across
  -- the whole batch.
  v_outside := private.without_blood_tie(p_tree, p_person_ids, p_person_ids);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      coalesce(nullif(private.person_label(v_outside[1]), ''), 'Someone')
      using errcode = '42501',
            detail = v_outside[1]::text;
  end if;

  perform private.ask_about_placements(p_tree, v_waiting, v_uid);

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.place_people(uuid, uuid[]) from anon, public;
grant execute on function public.place_people(uuid, uuid[]) to authenticated, service_role;

-- A Root asks again about cards whose ask lapsed: a new 30 days, and the
-- notices and the email of a first ask. Says who it asked about; an ask
-- still waiting, or answered, is left as it is.
create or replace function public.ask_placements_again(p_tree uuid, p_person_ids uuid[])
returns table (asked_person_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_ids uuid[];
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can ask again' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);
  with again as (
    update public.tree_placements pl
    set asked_at = now(), reminded_at = null, lapse_told_at = null, placed_by = v_uid
    where pl.tree_id = p_tree
      and pl.person_id = any (coalesce(p_person_ids, '{}'))
      and pl.status = 'active'
      and pl.approval = 'asked'
      and pl.asked_at <= now() - interval '30 days'
    returning pl.person_id
  )
  select coalesce(array_agg(a.person_id), '{}') into v_ids from again a;
  perform set_config('ancestree.privileged_profile_write', v_was, true);

  perform private.ask_about_placements(p_tree, v_ids, v_uid);

  return query select u.id from unnest(v_ids) as u(id);
end;
$$;

revoke all on function public.ask_placements_again(uuid, uuid[]) from anon, public;
grant execute on function public.ask_placements_again(uuid, uuid[]) to authenticated, service_role;

-- As `20260929090000_carry_a_family_line`, a lapsed ask said to be one.
create or replace function public.placement_asks()
returns table (
  placement_id uuid,
  tree_id uuid,
  tree_name text,
  person_id uuid,
  person_name text,
  own boolean,
  home_tree_id uuid,
  home_tree_name text,
  asked_by_name text,
  asked_at timestamptz,
  approval text,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pl.id,
    pl.tree_id,
    t.name,
    pl.person_id,
    private.person_label(pl.person_id),
    o.owner is not null,
    pe.tree_id,
    h.name,
    private.member_label(pl.placed_by),
    pl.asked_at,
    private.placement_approval_now(pl.approval, pl.asked_at),
    pl.responded_at
  from public.tree_placements pl
  join public.trees t on t.id = pl.tree_id
  join public.people pe on pe.id = pl.person_id
  join public.trees h on h.id = pe.tree_id
  cross join lateral (select private.person_owner_member(pl.person_id) as owner) o
  where (select auth.uid()) is not null
    and pl.status = 'active'
    and pl.approval <> 'none'
    and pl.tree_id <> pe.tree_id
    and case
          when o.owner is not null then o.owner = (select auth.uid())
          else private.can_edit_person(pl.person_id)
        end
  order by pl.asked_at desc nulls last, 5;
$$;

create or replace function public.tree_carried(p_tree uuid)
returns table (
  placement_id uuid,
  person_id uuid,
  person_name text,
  home_tree_name text,
  approval text,
  detail text,
  asked_of text,
  asked_at timestamptz,
  responded_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    pl.id,
    pl.person_id,
    private.person_label(pl.person_id),
    h.name,
    private.placement_approval_now(pl.approval, pl.asked_at),
    pl.detail,
    case
      when pl.approval = 'none' then null
      when private.person_owner_member(pl.person_id) is not null then 'owner'
      else 'stewards'
    end,
    pl.asked_at,
    pl.responded_at
  from public.tree_placements pl
  join public.people pe on pe.id = pl.person_id
  join public.trees h on h.id = pe.tree_id
  where private.is_root_of(p_tree)
    and pl.tree_id = p_tree
    and pl.status = 'active'
    and pe.tree_id <> p_tree
  order by pl.created_at desc, 3;
$$;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placements_requested',
    'placement_accepted', 'placement_declined', 'placements_lapsed',
    'tree_request_approved', 'placed_on_join', 'joined_by_link',
    'change_suggested', 'suggestion_accepted', 'suggestion_declined'
  )
);

-- What a tree's waiting asks have to send, handed out once: whoever asked
-- is told of each lapse here, and the rows that come back are the reminders
-- to email — as `placement_ask_recipients`, with who asked. Two calls at
-- once can't both take an ask: the second waits for the first's row and
-- finds it taken. The server's own key only; addresses never reach a
-- browser.
create or replace function public.run_placement_nudges(p_tree uuid)
returns table (
  email text,
  kind text,
  person_name text,
  entries integer,
  home_tree_name text,
  placer_name text,
  tree_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_was text := coalesce(current_setting('ancestree.privileged_profile_write', true), '');
  v_tree_name text;
  v_lapsed record;
begin
  select t.name into v_tree_name from public.trees t where t.id = p_tree;
  if not found then
    return;
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_lapsed in
    with told as (
      update public.tree_placements pl
      set lapse_told_at = now()
      where pl.tree_id = p_tree
        and pl.status = 'active'
        and pl.approval = 'asked'
        and pl.lapse_told_at is null
        and pl.asked_at <= now() - interval '30 days'
      returning pl.id, pl.person_id, pl.placed_by
    )
    select
      t.placed_by,
      count(*) as entries,
      (array_agg(t.person_id order by t.id))[1] as first_person
    from told t
    where t.placed_by is not null
    group by t.placed_by
  loop
    insert into public.notifications
      (recipient_user_id, actor_user_id, type, person_id, body, tree_id)
    values (
      v_lapsed.placed_by, null, 'placements_lapsed',
      case when v_lapsed.entries = 1 then v_lapsed.first_person end,
      'No answer in 30 days about '
        || case
             when v_lapsed.entries = 1 then
               coalesce(nullif(private.person_label(v_lapsed.first_person), ''), 'an entry')
                 || '''s full entry'
             else v_lapsed.entries || ' full entries'
           end
        || ' on ' || coalesce(v_tree_name, 'your tree') || '.',
      p_tree
    );
  end loop;

  return query
  with due as (
    update public.tree_placements pl
    set reminded_at = now()
    where pl.tree_id = p_tree
      and pl.status = 'active'
      and pl.approval = 'asked'
      and pl.reminded_at is null
      and pl.asked_at <= now() - interval '7 days'
      and pl.asked_at > now() - interval '30 days'
    returning pl.person_id, pl.placed_by
  ),
  asked as (
    select
      d.person_id,
      d.placed_by,
      pe.tree_id as home,
      private.person_owner_member(d.person_id) as owner
    from due d
    join public.people pe on pe.id = d.person_id
  ),
  asks as (
    select a.owner as user_id, 'owner' as kind, a.home, a.person_id, a.placed_by
    from asked a
    where a.owner is not null
    union all
    select s.user_id, 'steward', a.home, a.person_id, a.placed_by
    from asked a
    cross join lateral private.placement_stewards(a.person_id) as s(user_id)
    where a.owner is null
      and s.user_id is distinct from a.placed_by
  )
  select
    lower(u.email)::text,
    k.kind,
    case when count(*) = 1 then private.person_label((array_agg(k.person_id))[1]) end,
    count(*)::integer,
    (select t.name from public.trees t where t.id = k.home),
    coalesce(private.member_label(k.placed_by), 'A Root'),
    v_tree_name
  from asks k
  join auth.users u on u.id = k.user_id
  where u.deleted_at is null
    and coalesce(u.email, '') <> ''
  group by u.email, k.kind, k.home, k.placed_by;

  perform set_config('ancestree.privileged_profile_write', v_was, true);
end;
$$;

revoke all on function public.run_placement_nudges(uuid) from public, anon, authenticated;
grant execute on function public.run_placement_nudges(uuid) to service_role;
