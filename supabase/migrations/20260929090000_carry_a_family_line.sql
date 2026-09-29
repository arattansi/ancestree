-- Step 80 — Carrying a family line to another tree
--
-- A Root brings people onto their tree from another tree they're on (Step
-- 25). Until now a member's own entry wasn't drawn until that member said
-- yes, and anyone else's came over whole with nobody asked. From here on
-- everyone brought over is on the new tree at once as a basic card — first
-- or preferred name, last name, place of birth, and their lines — and the
-- rest of the entry waits for a yes:
--
--   * a member's own entry: that member's, asked by notice and by email;
--   * nobody's own entry: whoever may edit it on its home tree — its Roots,
--     the Branch who tends it, the member who added it;
--   * an entry the Root bringing it may edit already, their own included:
--     nobody's. It comes over whole.
--
-- A no leaves the basic card where it is, and a yes can be taken back.
--
-- `tree_placements.status` stays: 'active' is "on the tree", and every
-- structural rule (the bloodline, a Branch's side, a Leaf's line, drawing a
-- line) reads it as before. How much of the entry the tree shows is the new
-- `approval`, and `detail` ('basic' | 'full') follows from it. Nothing
-- writes 'pending' or 'declined' into `status` any more.
--
-- Safe under the code that was live when this was applied: it reads
-- `tree_people` and `tree_edges`, whose columns are all still there (three
-- more at the end of `tree_people`), and calls `place_people` and
-- `respond_to_placement` by the same names and arguments. Live had no
-- placement off its home tree.

-- ---------------------------------------------------------------------------
-- 1. How much of an entry a tree shows
-- ---------------------------------------------------------------------------
alter table public.tree_placements
  add column approval text not null default 'none'
    constraint tree_placements_approval_check
    check (approval in ('none', 'asked', 'approved', 'declined')),
  add column asked_at timestamptz,
  add column answered_by uuid references public.profiles (auth_user_id) on delete set null;

-- 'none': nothing to ask (the home tree, their own say-so, an entry its
-- placer may edit). 'asked' and 'declined' show the basic card.
alter table public.tree_placements
  add column detail text not null generated always as (
    case when approval in ('asked', 'declined') then 'basic' else 'full' end
  ) stored;

-- Step 25's waiting and declined placements become basic cards.
update public.tree_placements
set approval = case status when 'pending' then 'asked' else 'declined' end,
    asked_at = created_at,
    status = 'active'
where status in ('pending', 'declined');

create index tree_placements_approval_idx
  on public.tree_placements (approval)
  where approval <> 'none';

-- Only a card's position is a member's to change; the answer is written by
-- `answer_placements` and the functions below. As
-- `20260923173000_remove_member_who_added_entries`, with the new columns
-- held, and whoever answered going the way whoever placed it does.
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
       or (new.placed_by is distinct from old.placed_by and not v_placer_gone)
       or (new.answered_by is distinct from old.answered_by and not v_answerer_gone) then
      raise exception 'Only a card''s position can be changed here' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- A Root takes a card off their tree. The person it shows no longer can:
-- their basic card needs nobody's yes, and `answer_placements` is how they
-- take the rest of their entry back.
drop policy if exists tree_placements_delete on public.tree_placements;
create policy tree_placements_delete on public.tree_placements for delete to authenticated
  using ((select private.is_root_of(tree_id)));

-- ---------------------------------------------------------------------------
-- 2. Who reads an entry, and a line
-- ---------------------------------------------------------------------------
create or replace function private.is_placed_in_full(p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_placements pl
    where pl.tree_id = p_tree and pl.person_id = p_person
      and pl.status = 'active' and pl.detail = 'full'
  );
$$;

-- A person's details: shown in full on a tree the caller belongs to, or on
-- one they visit unless the person is hidden from visitors. A basic card
-- opens nothing here: not the row, the photo or a claim.
create or replace function private.can_see_person(p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_placements pl
    join public.tree_members m on m.tree_id = pl.tree_id
    where pl.person_id = p_person
      and pl.status = 'active'
      and pl.detail = 'full'
      and m.user_id = (select auth.uid())
  )
  or exists (
    select 1
    from public.tree_placements pl
    join public.people pe on pe.id = pl.person_id
    where pl.person_id = p_person
      and pl.status = 'active'
      and pl.detail = 'full'
      and not pe.hidden_from_visitors
      and private.is_visitor_of(pl.tree_id)
  );
$$;

-- A line and its dates: both ends shown in full on one tree the caller
-- belongs to or visits. (A hidden person's lines still draw to a blurred
-- card.)
create or replace function private.can_see_edge(p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.tree_placements a
    join public.tree_placements b
      on b.tree_id = a.tree_id and b.person_id = p_to
     and b.status = 'active' and b.detail = 'full'
    where a.person_id = p_from and a.status = 'active' and a.detail = 'full'
      and private.can_view_tree(a.tree_id)
  );
$$;

-- A line drawn on a tree the caller belongs to, both ends still on it: its
-- members read it whole, a basic card at either end or not, since it is
-- theirs.
create or replace function private.can_see_drawn_edge(p_tree uuid, p_from uuid, p_to uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    p_tree is not null
    and private.is_tree_member(p_tree)
    and private.is_placed(p_tree, p_from)
    and private.is_placed(p_tree, p_to);
$$;

revoke all on function
  private.is_placed_in_full(uuid, uuid), private.can_see_drawn_edge(uuid, uuid, uuid)
  from public, anon;
grant execute on function
  private.is_placed_in_full(uuid, uuid), private.can_see_drawn_edge(uuid, uuid, uuid)
  to authenticated, service_role;

drop policy if exists relationships_select on public.relationships;
create policy relationships_select on public.relationships for select to authenticated
  using (
    (select private.can_see_edge(from_person, to_person))
    or (select private.can_see_drawn_edge(tree_id, from_person, to_person))
  );

-- ---------------------------------------------------------------------------
-- 3. The tree views: basic cards and the lines between them
-- ---------------------------------------------------------------------------
-- Read as their owner, so they say who may look themselves: a member of the
-- tree, a visitor to it, or the server's own key (a share link's page).
-- Reached only through `tree_people` and `tree_edges`.
create view private.basic_tree_people
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
  pl.approval,
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
  end as asked_of
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

-- A line with a basic card at either end: that it is there, what kind, and
-- whether a marriage ended. Its dates only on the tree it was drawn on.
create view private.basic_tree_edges
with (security_invoker = false) as
select
  a.tree_id,
  r.id,
  r.from_person,
  r.to_person,
  r.type,
  r.created_by,
  case when r.tree_id = a.tree_id then r.marriage_date end as marriage_date,
  r.is_divorced,
  case when r.tree_id = a.tree_id then r.divorce_date end as divorce_date,
  r.tree_id as drawn_on_tree_id,
  r.created_at,
  case when r.tree_id = a.tree_id then r.marriage_month end as marriage_month,
  case when r.tree_id = a.tree_id then r.marriage_day end as marriage_day
from public.relationships r
join public.tree_placements a
  on a.person_id = r.from_person and a.status = 'active'
join public.tree_placements b
  on b.person_id = r.to_person and b.status = 'active' and b.tree_id = a.tree_id
where (a.detail = 'basic' or b.detail = 'basic')
  and (
    private.can_view_tree(a.tree_id)
    or coalesce((select auth.role()), '') = 'service_role'
  );

revoke all on private.basic_tree_people, private.basic_tree_edges from public, anon;
grant select on private.basic_tree_people, private.basic_tree_edges
  to authenticated, service_role;

-- As `20260929010000_circa_dates` (Step 81) left it, for the cards shown in
-- full; a basic card's row carries its name and place of birth and nothing
-- else. `detail`, `approval` and `asked_of` are new, at the end.
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
  null::text as asked_of
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
  b.asked_of
from private.basic_tree_people b;

-- As `20260928001000_dates_without_a_year`, for the lines between cards
-- shown in full.
create or replace view public.tree_edges
with (security_invoker = true) as
select
  a.tree_id,
  r.id,
  r.from_person,
  r.to_person,
  r.type,
  r.created_by,
  r.marriage_date,
  r.is_divorced,
  r.divorce_date,
  r.tree_id as drawn_on_tree_id,
  r.created_at,
  r.marriage_month,
  r.marriage_day
from public.relationships r
join public.tree_placements a
  on a.person_id = r.from_person and a.status = 'active' and a.detail = 'full'
join public.tree_placements b
  on b.person_id = r.to_person and b.status = 'active' and b.detail = 'full'
 and b.tree_id = a.tree_id
union all
select
  e.tree_id,
  e.id,
  e.from_person,
  e.to_person,
  e.type,
  e.created_by,
  e.marriage_date,
  e.is_divorced,
  e.divorce_date,
  e.drawn_on_tree_id,
  e.created_at,
  e.marriage_month,
  e.marriage_day
from private.basic_tree_edges e;

-- ---------------------------------------------------------------------------
-- 4. What a basic card doesn't open: documents, the board, others' lines
-- ---------------------------------------------------------------------------
create or replace function private.can_see_document(p_document_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.documents d
    where d.id = p_document_id
      and (
        (private.is_placed_in_full(d.tree_id, d.person_id) and private.document_rule_in(d.tree_id, d.person_id))
        or (
          d.shared_across_trees
          and exists (
            select 1 from public.tree_placements pl
            where pl.person_id = d.person_id and pl.status = 'active' and pl.detail = 'full'
              and private.document_rule_in(pl.tree_id, d.person_id)
          )
        )
      )
  );
$$;

create or replace function private.can_see_documents(p_person_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.tree_placements pl
    where pl.person_id = p_person_id and pl.status = 'active' and pl.detail = 'full'
      and private.document_rule_in(pl.tree_id, p_person_id)
  );
$$;

create or replace function private.can_write_document(p_tree uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    private.is_placed_in_full(p_tree, p_person)
    and private.is_tree_member(p_tree)
    and (private.can_edit_person(p_person) or private.is_root_of(p_tree));
$$;

drop policy if exists entry_comments_insert on public.entry_comments;
create policy entry_comments_insert on public.entry_comments for insert to authenticated
  with check (
    created_by = (select auth.uid())
    and (select private.is_tree_member(tree_id))
    and (select private.is_placed_in_full(tree_id, person_id))
  );

-- Whoever drew a line; a Root of a tree that shows both ends in full, or a
-- Branch there with both on their side; and a Root of the tree it was drawn
-- on while both ends are on it, so a line to a basic card can be put right.
create or replace function private.can_edit_relationship(p_rel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.relationships r
    where r.id = p_rel_id
      and (
        (r.created_by = (select auth.uid()) and private.is_tree_member(r.tree_id))
        or (
          private.is_root_of(r.tree_id)
          and private.is_placed(r.tree_id, r.from_person)
          and private.is_placed(r.tree_id, r.to_person)
        )
        or exists (
          select 1
          from public.tree_placements a
          join public.tree_placements b
            on b.tree_id = a.tree_id and b.person_id = r.to_person
           and b.status = 'active' and b.detail = 'full'
          where a.person_id = r.from_person and a.status = 'active' and a.detail = 'full'
            and (
              private.is_root_of(a.tree_id)
              or (
                private.is_on_own_branch(r.from_person, a.tree_id)
                and private.is_on_own_branch(r.to_person, a.tree_id)
              )
            )
        )
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- 5. The home tree shows the whole entry
-- ---------------------------------------------------------------------------
-- Moving an entry's home is its owner's doing, or for nobody's own entry a
-- Root's of the home it leaves: the yes a basic card waits for.
create or replace function private.people_home_placement()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tree_placements (tree_id, person_id, status, placed_by)
  values (new.tree_id, new.id, 'active', new.created_by)
  on conflict (tree_id, person_id) do update
    set status = 'active',
        approval = 'none',
        responded_at = coalesce(public.tree_placements.responded_at, now());
  return new;
end;
$$;

-- A tree being deleted hands its entries to another tree that shows them in
-- full. One that shows only a basic card was never given the entry, so it
-- doesn't inherit it. As `20260922110000_visitors_and_tree_deletion`.
create or replace function public.delete_tree(p_tree uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_moved int := 0;
  v_gone int := 0;
  v_row record;
  v_new_home uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can delete a tree' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_row in
    select pe.id from public.people pe where pe.tree_id = p_tree
  loop
    select pl.tree_id into v_new_home
    from public.tree_placements pl
    where pl.person_id = v_row.id and pl.tree_id <> p_tree
      and pl.status = 'active' and pl.detail = 'full'
    order by pl.created_at asc
    limit 1;

    if v_new_home is not null then
      update public.people set tree_id = v_new_home where id = v_row.id;
      v_moved := v_moved + 1;
    else
      v_gone := v_gone + 1;
    end if;
  end loop;

  -- Their own entry gone with the tree: members start over elsewhere.
  update public.profiles p
  set self_person_id = null
  where p.self_person_id in (select id from public.people where tree_id = p_tree);

  delete from public.trees where id = p_tree;

  perform set_config('ancestree.privileged_profile_write', '', true);
  return jsonb_build_object('moved', v_moved, 'deleted', v_gone);
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Claiming and suggesting need the whole entry
-- ---------------------------------------------------------------------------
-- "This is me" on a basic card would hand its claimant the entry before
-- anyone on its home tree had a say. Each as its latest version, reading a
-- full placement where it read any.
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
      private.person_invited_to_claim(pe.id) as vouched,
      case when v_named then private.self_candidate_score(pe.id, p_first, p_last) end as name_score
    from public.people pe
    where private.is_placed_in_full(v_tree, pe.id)
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
    pe.id, pe.first_name, pe.preferred_name, pe.last_name, pe.maiden_name,
    pe.date_of_birth, pe.date_of_death, pe.is_deceased, pe.city_of_birth, pe.country_of_birth,
    (
      select string_agg(private.person_label(r.from_person), ' & ')
      from public.relationships r
      where r.to_person = pe.id and r.type = 'parent'
    ) as parent_names,
    case when ca.vouched then 1::real else ca.name_score end as score
  from candidates ca
  join public.people pe on pe.id = ca.person_id
  where ca.vouched or ca.name_score is not null
  order by ca.vouched desc, score desc, pe.date_of_birth asc nulls last
  limit 10;
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
  if not private.is_placed_in_full(p_tree, p_person) then
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
    p_tree
  );

  return jsonb_build_object('claim_id', v_claim_id, 'person_id', p_person);
end;
$$;

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
  where pl.person_id = p_person_id and pl.status = 'active' and pl.detail = 'full'
    and private.is_placed(pl.tree_id, v_self)
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
    v_tree
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
    join public.tree_placements pl
      on pl.person_id = pe.id and pl.status = 'active' and pl.detail = 'full'
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

create or replace function public.suggest_entry_change(
  p_person uuid,
  p_tree uuid,
  p_values jsonb,
  p_note text default null
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_row public.people%rowtype;
  v_next public.people%rowtype;
  v_old jsonb;
  v_new jsonb;
  v_key text;
  v_detail text;
  v_columns text[];
  v_column text;
  v_changes jsonb := '{}';
  v_before jsonb := '{}';
  v_details text[] := '{}';
  v_words text[] := '{}';
  v_note text := nullif(btrim(p_note), '');
  v_name text;
  v_label text;
  v_id uuid;
  v_recipient uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_values is null or jsonb_typeof(p_values) <> 'object' then
    raise exception 'SUGGEST: nothing to suggest' using errcode = '22023';
  end if;
  for v_key in select jsonb_object_keys(p_values) loop
    if not exists (
      select 1 from private.suggestion_columns() s where v_key = any (s.columns)
    ) then
      raise exception 'SUGGEST: % can''t be suggested', v_key using errcode = '22023';
    end if;
  end loop;
  if length(v_note) > 500 then
    raise exception 'SUGGEST: the note is longer than 500 characters'
      using errcode = '22001';
  end if;

  -- A member of a tree the entry is shown on, who can't edit it themselves.
  if not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, p_person)) then
    raise exception 'SUGGEST: not on your tree' using errcode = '42501';
  end if;
  if private.can_edit_person(p_person) then
    raise exception 'SUGGEST: yours to edit' using errcode = '42501';
  end if;

  select * into v_row from public.people where id = p_person;
  if not found then
    raise exception 'SUGGEST: that entry no longer exists' using errcode = '42501';
  end if;

  -- The entry as it would be. Going through its row type refuses a date, a
  -- number or a yes-or-no that isn't one.
  v_next := jsonb_populate_record(v_row, p_values);
  v_next.first_name := nullif(btrim(v_next.first_name), '');
  v_next.middle_name := nullif(btrim(v_next.middle_name), '');
  v_next.preferred_name := nullif(btrim(v_next.preferred_name), '');
  v_next.maiden_name := nullif(btrim(v_next.maiden_name), '');
  v_next.last_name := btrim(v_next.last_name);
  v_next.city_of_birth := nullif(btrim(v_next.city_of_birth), '');
  v_next.country_of_birth := coalesce(btrim(v_next.country_of_birth), '');
  v_next.place_of_death := nullif(btrim(v_next.place_of_death), '');
  v_next.is_deceased := coalesce(v_next.is_deceased, v_row.is_deceased);
  if greatest(
       length(v_next.first_name), length(v_next.middle_name),
       length(v_next.preferred_name), length(v_next.maiden_name),
       length(v_next.last_name), length(v_next.city_of_birth),
       length(v_next.country_of_birth)
     ) > 120
     or length(v_next.place_of_death) > 160 then
    raise exception 'SUGGEST: longer than a detail may be' using errcode = '22001';
  end if;
  -- Someone living has no death details, and a precision means something
  -- only beside its date: without one, the entry's stays as it is.
  if not v_next.is_deceased then
    v_next.date_of_death := null;
    v_next.place_id_death := null;
    v_next.place_of_death := null;
  end if;
  if v_next.date_of_birth is null then
    v_next.date_of_birth_precision := v_row.date_of_birth_precision;
  end if;
  if v_next.date_of_death is null then
    v_next.date_of_death_precision := v_row.date_of_death_precision;
  end if;

  v_old := to_jsonb(v_row);
  v_new := to_jsonb(v_next);
  for v_detail, v_columns in
    select s.detail, s.columns from private.suggestion_columns() s
  loop
    if exists (
      select 1 from unnest(v_columns) c where v_old -> c is distinct from v_new -> c
    ) then
      v_details := array_append(v_details, v_detail);
      foreach v_column in array v_columns loop
        v_changes := v_changes || jsonb_build_object(v_column, v_new -> v_column);
        v_before := v_before || jsonb_build_object(v_column, v_old -> v_column);
      end loop;
    end if;
  end loop;
  if array_length(v_details, 1) is null then
    raise exception 'SUGGEST: nothing changed' using errcode = '22023';
  end if;

  -- It has to fit the entry: tried against every check on people, then
  -- undone, whatever happened.
  begin
    update public.people set
      first_name = v_next.first_name,
      middle_name = v_next.middle_name,
      preferred_name = v_next.preferred_name,
      maiden_name = v_next.maiden_name,
      last_name = v_next.last_name,
      sex = v_next.sex,
      date_of_birth = v_next.date_of_birth,
      date_of_birth_precision = v_next.date_of_birth_precision,
      birth_month = v_next.birth_month,
      birth_day = v_next.birth_day,
      place_id_birth = v_next.place_id_birth,
      city_of_birth = v_next.city_of_birth,
      country_of_birth = v_next.country_of_birth,
      is_deceased = v_next.is_deceased,
      date_of_death = v_next.date_of_death,
      date_of_death_precision = v_next.date_of_death_precision,
      place_id_death = v_next.place_id_death,
      place_of_death = v_next.place_of_death
    where id = p_person;
    raise exception using errcode = 'SG000';
  exception
    when sqlstate 'SG000' then
      null;
    when check_violation or not_null_violation or foreign_key_violation then
      raise exception 'SUGGEST: that doesn''t fit the entry' using errcode = '23514';
  end;

  -- Their earlier suggestion for this entry, still waiting, gives way.
  delete from public.entry_suggestions
  where person_id = p_person and suggested_by = v_uid and status = 'pending';

  v_name := private.member_label(v_uid);
  insert into public.entry_suggestions
    (person_id, tree_id, suggested_by, suggested_by_name, changes, before, note)
  values (p_person, p_tree, v_uid, v_name, v_changes, v_before, v_note)
  returning id into v_id;

  -- Said the way an edit's notice says it.
  if v_details && array['first_name', 'middle_name', 'preferred_name'] then
    v_words := array_append(v_words, 'name');
  end if;
  if v_details && array['last_name', 'maiden_name'] then
    v_words := array_append(v_words, 'family name');
  end if;
  if 'date_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'date of birth');
  end if;
  if 'place_of_birth' = any (v_details) then
    v_words := array_append(v_words, 'birthplace');
  end if;
  if v_details && array['is_deceased', 'date_of_death', 'place_of_death'] then
    v_words := array_append(v_words, 'death details');
  end if;
  if 'sex' = any (v_details) then
    v_words := array_append(v_words, 'sex');
  end if;

  -- Asked: whoever owns the entry, the Roots of its home tree and the
  -- Branches there who tend it (Step 68), in that tree's inbox.
  v_label := private.person_label(p_person);
  for v_recipient in
    select v_row.owner_user_id
    union
    select m.user_id from public.tree_members m
    where m.tree_id = v_row.tree_id and m.role = 'admin'
    union
    select b.user_id from private.tending_branches(p_person) as b(user_id)
  loop
    if v_recipient is not null and v_recipient <> v_uid then
      insert into public.notifications
        (recipient_user_id, actor_user_id, type, person_id, body, tree_id, suggestion_id)
      values (
        v_recipient, v_uid, 'change_suggested', p_person,
        coalesce(v_name, 'A relative') || ' suggested a change to ' || v_label
          || ': ' || array_to_string(v_words, ', ') || '.',
        v_row.tree_id, v_id
      );
    end if;
  end loop;

  return v_details;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Joining a tree shows their whole entry there
-- ---------------------------------------------------------------------------
-- Accepting an invite is their say-so (Step 30.9), so a basic card of theirs
-- on that tree becomes the whole entry. As
-- `20260928170000_root_not_admin_messages` and
-- `20260923153000_claim_invite_merges_into_own_entry`.
create or replace function public.redeem_invite(p_token text, p_display_name text default null)
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
  v_tree public.trees;
  v_name text;
  v_new_profile boolean := false;
  v_member text;
  v_inviter text;
  v_root uuid;
  -- A claim invite accepted by someone whose own entry is another one.
  v_claimed text;
  v_maker uuid;
  v_merged boolean := false;
  v_joined text;
  -- The family link (Step 52): how they came in, for the Roots' notices.
  v_family_link boolean;
  v_via_link text;
  v_told boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_invite
  from public.invites
  where token = p_token
    and status = 'active'
    and archived_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if not found then
    raise exception 'invalid_or_expired_invite' using errcode = '22023';
  end if;

  -- An invite emailed to someone joins that address and no other (Step 51),
  -- not whoever happens to be signed in where it's opened: a forwarded
  -- email, a shared device. For a claim invite that would hand them the
  -- entry it names. The account's own address, verified, must be the one it
  -- was sent to. A bare link names nobody, so anyone may still take it.
  if v_invite.invited_email is not null
     and not exists (
       select 1 from auth.users u
       where u.id = v_uid
         and u.email_confirmed_at is not null
         and lower(u.email) = lower(btrim(v_invite.invited_email))
     ) then
    raise exception 'INVITE_FOR_ANOTHER_ADDRESS: this invite was sent to another email address'
      using errcode = '42501';
  end if;

  -- A family link (Step 52) goes round a family group, where most who open
  -- it may be members already: they go straight through, uncounted. Anyone
  -- else takes one of its places, and once they're gone it's closed.
  v_family_link := v_invite.max_uses is not null;
  if v_family_link then
    if exists (
      select 1 from public.tree_members m
      where m.tree_id = v_invite.tree_id and m.user_id = v_uid
    ) then
      perform set_config('ancestree.redeemed_tree', v_invite.tree_id::text, true);
      select * into v_profile from public.profiles where auth_user_id = v_uid;
      return v_profile;
    end if;
    if v_invite.use_count >= v_invite.max_uses then
      raise exception 'invalid_or_expired_invite' using errcode = '22023';
    end if;
  end if;

  v_email := private.current_email();
  v_name := coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1));

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if not found then
    insert into public.profiles (auth_user_id, display_name, invited_by_user_id)
    values (v_uid, v_name, v_invite.created_by)
    returning * into v_profile;
    v_new_profile := true;
  end if;

  if v_invite.founds_tree then
    if exists (select 1 from public.trees t where t.created_by = v_uid) then
      raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
    end if;
    v_tree := private.found_tree_for(v_uid, private.default_tree_name(v_uid));
  else
    perform private.join_tree(v_invite.tree_id, v_uid, v_invite.joins_as, v_invite.created_by);
    select * into v_tree from public.trees where id = v_invite.tree_id;
  end if;

  -- Counted and recorded (Step 52). The row is locked above, so the count
  -- can't pass the cap.
  if v_family_link then
    update public.invites
    set use_count = use_count + 1
    where id = v_invite.id
    returning * into v_invite;
    insert into private.family_link_joins (tree_id, user_id, invite_id)
    values (v_tree.id, v_uid, v_invite.id);
    v_via_link := ' joined ' || v_tree.name || ' with the family link ('
      || v_invite.use_count || ' of ' || v_invite.max_uses
      || case when v_invite.use_count >= v_invite.max_uses then ', now full' else '' end
      || ')';
  end if;

  -- A claim invite (never a founder invite: `invites_guard`). Its vouch for
  -- the entry outlives the invite.
  if v_invite.person_id is not null then
    insert into private.claim_vouches (user_id, person_id)
    values (v_uid, v_invite.person_id)
    on conflict do nothing;

    -- Someone with no entry of their own claims it here (Step 30.2), the
    -- vouch standing in for the name match. Anything that stops the claim —
    -- the entry claimed by someone else, deleted or off this tree, the daily
    -- limit — leaves them joined, for onboarding to take from there.
    if v_profile.self_person_id is null then
      begin
        perform private.claim_as_self(v_invite.person_id, v_tree.id, true);
        -- Named after the entry, not the email, when the invite carried no name.
        if v_new_profile and nullif(btrim(p_display_name), '') is null then
          update public.profiles
          set display_name = coalesce(nullif(private.person_label(v_invite.person_id), ''), display_name)
          where auth_user_id = v_uid;
        end if;
      exception when others then
        null;
      end;
    -- Someone who has an entry already (Step 41.3): the invite's entry folds
    -- into theirs when its maker alone has built on it, and theirs takes its
    -- place here. Otherwise it's left as it is, and theirs is shown beside it
    -- below, for a Root to sort out. Either way the Roots hear which.
    elsif v_invite.person_id <> v_profile.self_person_id then
      v_claimed := coalesce(nullif(private.person_label(v_invite.person_id), ''), 'an entry');
      select created_by into v_maker from public.people where id = v_invite.person_id;
      begin
        v_merged := private.merge_invited_entry(v_invite.person_id, v_profile.self_person_id, v_tree.id);
      exception when others then
        v_merged := false;
      end;
    end if;
  end if;

  -- An invite accepted by someone who has an entry of their own shows it on
  -- the tree they've joined (Step 30.9): accepting is their say-so. Since
  -- Step 41.3 that includes a claim invite, unless its merge above placed it
  -- already. Every Root of the tree is told, and can take it off again. A
  -- founder brings theirs over on their first run. Anything that stops it
  -- leaves them joined.
  if not v_invite.founds_tree
     and v_profile.self_person_id is not null
     and not private.is_placed_in_full(v_tree.id, v_profile.self_person_id) then
    begin
      insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
      values (v_tree.id, v_profile.self_person_id, 'active', v_uid, now())
      on conflict (tree_id, person_id) do update
        set status = 'active', responded_at = now(),
            approval = case when tp.approval = 'none' then 'none' else 'approved' end,
            answered_by = case when tp.approval = 'none' then tp.answered_by else v_uid end;

      -- A claim invite's own notice follows below.
      if v_claimed is null then
        v_member := coalesce(private.member_label(v_uid), 'A relative');
        v_inviter := private.member_label(v_invite.created_by);
        for v_root in
          select m.user_id from public.tree_members m
          where m.tree_id = v_tree.id and m.role = 'admin'
        loop
          perform private.notify(
            v_root, v_uid, 'placed_on_join', v_profile.self_person_id, null,
            v_member
              || case
                   when v_family_link then v_via_link
                   when v_root = v_invite.created_by then ' accepted your invite to ' || v_tree.name
                   else ' joined ' || v_tree.name || coalesce(' with an invite from ' || v_inviter, ' with an invite')
                 end
              || ', bringing their own entry from another tree. You can take it off this tree from the Root console.',
            v_tree.id
          );
        end loop;
        v_told := true;
      end if;
    exception when others then
      null;
    end;
  end if;

  -- Everyone else who came in by the family link (Step 52): each Root hears
  -- who, and how full it is.
  if v_family_link and not v_told then
    begin
      v_member := coalesce(private.member_label(v_uid), 'A relative');
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        perform private.notify(
          v_root, v_uid, 'joined_by_link', null, null,
          v_member || v_via_link || '.',
          v_tree.id
        );
      end loop;
    exception when others then
      null;
    end;
  end if;

  -- What accepting a claim invite did with the entry it named (Step 41.3):
  -- folded into theirs, or both on the tree now. Told to every Root, and to
  -- whoever made the entry if it was merged away and they aren't one.
  if v_claimed is not null
     and private.is_placed(v_tree.id, v_profile.self_person_id) then
    begin
      v_member := coalesce(private.member_label(v_uid), 'A relative');
      v_inviter := private.member_label(v_invite.created_by);
      for v_root in
        select m.user_id from public.tree_members m
        where m.tree_id = v_tree.id and m.role = 'admin'
      loop
        v_joined := case
          when v_root = v_invite.created_by then
            v_member || ' accepted your invite to claim ' || v_claimed
          else
            v_member || ' joined ' || v_tree.name
              || coalesce(' with an invite from ' || v_inviter, ' with an invite')
              || ' to claim ' || v_claimed
        end;
        perform private.notify(
          v_root, v_uid, 'placed_on_join',
          case when v_merged then v_profile.self_person_id else v_invite.person_id end,
          null,
          case
            when v_merged then
              v_joined || '. They already had their own entry on another tree, so theirs has taken that entry''s place on '
                || v_tree.name || ', with everything that was on it.'
            else
              v_joined || ', but already had their own entry on another tree, so ' || v_tree.name
                || ' now shows both. If they''re the same person, you can delete the entry '
                || case when v_root = v_invite.created_by then 'you invited them to claim' else 'they were invited to claim' end
                || ', or take their own entry off this tree from the Root console.'
          end,
          v_tree.id
        );
      end loop;

      if v_merged and exists (
        select 1 from public.tree_members m
        where m.tree_id = v_tree.id and m.user_id = v_maker and m.role <> 'admin'
      ) then
        perform private.notify(
          v_maker, v_uid, 'claim_approved', v_profile.self_person_id, null,
          case
            when v_maker = v_invite.created_by then
              v_member || ' accepted your invite to claim ' || v_claimed
            else
              v_member || ' accepted an invite to claim ' || v_claimed || ', which you added'
          end
            || '. They already had their own entry on another tree, so theirs has taken that entry''s place on '
            || v_tree.name || ', with everything that was on it.',
          v_tree.id
        );
      end if;
    exception when others then
      null;
    end;
  end if;

  perform set_config('ancestree.redeemed_tree', v_tree.id::text, true);

  -- A family link stays for the next one; any other invite is spent.
  if not v_family_link then
    delete from public.invite_requests where invite_id = v_invite.id;
    delete from public.invites where id = v_invite.id;
  end if;

  perform set_config('ancestree.privileged_profile_write', '', true);

  -- Read afresh: a claim above set `self_person_id` and perhaps the name.
  select * into v_profile from public.profiles where auth_user_id = v_uid;
  return v_profile;
end;
$$;

create or replace function private.merge_invited_entry(
  p_invited uuid, p_own uuid, p_tree uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
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

  -- Its notes stay on this tree's board, and its documents in this tree's
  -- bank: not shared across trees, since theirs is shown on others.
  update public.entry_comments set person_id = p_own where person_id = p_invited;
  update public.documents
  set person_id = p_own, shared_across_trees = false
  where person_id = p_invited;

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
$$;

-- ---------------------------------------------------------------------------
-- 8. Bringing people over, and answering
-- ---------------------------------------------------------------------------
-- Who is asked about nobody's own entry: the Roots of its home tree, the
-- Branches who tend it (Step 68), and the Branch or Leaf it belongs to since
-- they added it — everyone `private.can_edit_person` would let change it.
create or replace function private.placement_stewards(p_person uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  with e as (
    select pe.id, pe.tree_id as home, pe.owner_user_id
    from public.people pe
    where pe.id = p_person
      and private.person_owner_member(pe.id) is null
  )
  select m.user_id
  from e
  join public.tree_members m on m.tree_id = e.home and m.role = 'admin'
  union
  select b.user_id
  from e
  cross join lateral private.tending_branches(e.id) as b(user_id)
  union
  select m.user_id
  from e
  join public.tree_members m
    on m.tree_id = e.home and m.user_id = e.owner_user_id
   and m.role in ('branch_admin', 'member');
$$;

revoke all on function private.placement_stewards(uuid) from public, anon, authenticated;

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placements_requested',
    'placement_accepted', 'placement_declined',
    'tree_request_approved', 'placed_on_join', 'joined_by_link',
    'change_suggested', 'suggestion_accepted', 'suggestion_declined'
  )
);

-- A Root brings people onto their tree: anyone they can see on a tree they
-- belong to, with a blood tie here once the whole batch is placed (Step 55).
-- Everyone is on the tree at once. `newly_asked` says whose yes this call
-- asked for, so the app emails them once.
drop function public.place_people(uuid, uuid[]);

create function public.place_people(p_tree uuid, p_person_ids uuid[])
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
  v_tree_name text;
  v_founder uuid;
  v_self uuid;
  v_outside uuid[];
  v_placer text;
  v_waiting uuid[] := '{}';
  v_steward record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select name, created_by into v_tree_name, v_founder from public.trees where id = p_tree;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;
  v_placer := coalesce(private.member_label(v_uid), 'A Root');

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

    if newly_asked and v_owner is not null then
      perform private.notify(
        v_owner, v_uid, 'placement_requested', v_person, null,
        v_placer || ' would like to show your full entry on '
          || coalesce(v_tree_name, 'their tree') || '.',
        p_tree
      );
    elsif newly_asked then
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
    where s.user_id <> v_uid
    group by s.user_id, pe.tree_id
  loop
    insert into public.notifications
      (recipient_user_id, actor_user_id, type, person_id, body, tree_id)
    values (
      v_steward.user_id, v_uid, 'placements_requested',
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

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.place_people(uuid, uuid[]) from anon, public;
grant execute on function public.place_people(uuid, uuid[]) to authenticated, service_role;

-- Yes or no to showing the whole entry on a tree that isn't its home. A
-- member's own entry is theirs alone to answer for; nobody's own, whoever
-- may edit it. Either answer can be given again later, so a yes can be
-- taken back and a no put right. Whoever brought them over is told once for
-- the call.
create or replace function public.answer_placements(p_placement_ids uuid[], p_accept boolean)
returns table (placement_id uuid, placement_approval text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_ids uuid[] := coalesce(p_placement_ids, '{}');
  v_row public.tree_placements;
  v_owner uuid;
  v_to text := case when p_accept then 'approved' else 'declined' end;
  v_found int := 0;
  v_answered uuid[] := '{}';
  v_group record;
  v_who text;
  v_tree_name text;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  for v_row in
    select * from public.tree_placements
    where id = any (v_ids)
    order by id
    for update
  loop
    v_found := v_found + 1;
    if v_row.tree_id = private.home_tree(v_row.person_id) then
      raise exception 'A home tree shows the whole entry' using errcode = '23514';
    end if;

    v_owner := private.person_owner_member(v_row.person_id);
    if v_owner is not null and v_owner <> v_uid then
      raise exception 'Only the person this entry belongs to can answer' using errcode = '42501';
    end if;
    if v_owner is null and not private.can_edit_person(v_row.person_id) then
      raise exception 'Only someone who can edit this entry can answer' using errcode = '42501';
    end if;

    -- Said already: nothing to write, nobody to tell. Their own say-so
    -- ('none') is a yes.
    if v_row.approval = v_to or (p_accept and v_row.approval = 'none') then
      placement_id := v_row.id;
      placement_approval := v_row.approval;
      return next;
      continue;
    end if;

    update public.tree_placements
    set approval = v_to, answered_by = v_uid, responded_at = now()
    where id = v_row.id;

    -- Saying yes for their own entry makes them a member there, so they can
    -- keep it and its board up to date. A Root can change the type after.
    if p_accept and v_owner = v_uid then
      perform private.join_tree(v_row.tree_id, v_uid, 'member', v_row.placed_by);
    end if;

    v_answered := v_answered || v_row.id;
    placement_id := v_row.id;
    placement_approval := v_to;
    return next;
  end loop;

  if v_found < cardinality(v_ids) then
    raise exception 'That request no longer exists';
  end if;

  v_who := coalesce(private.member_label(v_uid), 'A relative');
  for v_group in
    select
      pl.tree_id,
      pl.placed_by,
      count(*) as entries,
      (array_agg(pl.person_id order by pl.id))[1] as first_person
    from public.tree_placements pl
    where pl.id = any (v_answered) and pl.placed_by is not null
    group by pl.tree_id, pl.placed_by
  loop
    select name into v_tree_name from public.trees where id = v_group.tree_id;
    perform private.notify(
      v_group.placed_by, v_uid,
      case when p_accept then 'placement_accepted' else 'placement_declined' end,
      case when v_group.entries = 1 then v_group.first_person end,
      null,
      v_who
        || case when p_accept then ' approved ' else ' declined ' end
        || case
             when v_group.entries > 1 then v_group.entries || ' full entries'
             when v_group.first_person = private.self_person_id() then 'their full entry'
             else coalesce(nullif(private.person_label(v_group.first_person), ''), 'an entry')
                    || '''s full entry'
           end
        || ' on ' || coalesce(v_tree_name, 'your tree') || '.',
      v_group.tree_id
    );
  end loop;

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.answer_placements(uuid[], boolean) from anon, public;
grant execute on function public.answer_placements(uuid[], boolean) to authenticated, service_role;

-- Step 25's name for answering one, kept for the notice's buttons.
create or replace function public.respond_to_placement(p_placement_id uuid, p_accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.answer_placements(array[p_placement_id], p_accept);
end;
$$;

-- What's been asked of the caller, answered or not: their own entry on
-- other trees, and nobody's own entries they may edit. Read here because a
-- tree they aren't on is one they can't otherwise see.
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
    pl.approval,
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

revoke all on function public.placement_asks() from anon, public;
grant execute on function public.placement_asks() to authenticated, service_role;

-- A Root's view of who has been brought onto their tree: how much of each
-- is shown, who was asked, and where they came from — a tree the Root may
-- not be on, so its name is read here.
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
    pl.approval,
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

revoke all on function public.tree_carried(uuid) from anon, public;
grant execute on function public.tree_carried(uuid) to authenticated, service_role;

-- What bringing each of these over would ask, before it's done: nothing
-- ('none'), the yes of the member whose entry it is ('owner'), or of whoever
-- may edit it ('stewards'). As `place_people` decides it; only of people
-- the caller can see.
create or replace function public.placement_preview(p_person_ids uuid[])
returns table (person_id uuid, asks text)
language sql
stable
security definer
set search_path = ''
as $$
  select
    u.id,
    case
      when o.owner = (select auth.uid()) then 'none'
      when o.owner is not null then 'owner'
      when private.can_edit_person(u.id) then 'none'
      else 'stewards'
    end
  from unnest(coalesce(p_person_ids, '{}')) as u(id)
  cross join lateral (select private.person_owner_member(u.id) as owner) o
  where (select auth.uid()) is not null
    and private.can_see_person(u.id);
$$;

revoke all on function public.placement_preview(uuid[]) from anon, public;
grant execute on function public.placement_preview(uuid[]) to authenticated, service_role;

-- Who to email about what was just asked: a member about their own entry,
-- and each person asked about nobody's own entries, once for each tree
-- they're asked about. The server's own key only; addresses never reach a
-- browser.
create or replace function public.placement_ask_recipients(p_tree uuid, p_person_ids uuid[])
returns table (
  email text,
  kind text,
  person_name text,
  entries integer,
  home_tree_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  with asked as (
    select
      pl.person_id,
      pe.tree_id as home,
      private.person_owner_member(pl.person_id) as owner
    from public.tree_placements pl
    join public.people pe on pe.id = pl.person_id
    where pl.tree_id = p_tree
      and pl.person_id = any (coalesce(p_person_ids, '{}'))
      and pl.status = 'active'
      and pl.approval = 'asked'
  ),
  asks as (
    select a.owner as user_id, 'owner' as kind, a.home, a.person_id
    from asked a
    where a.owner is not null
    union all
    select s.user_id, 'steward', a.home, a.person_id
    from asked a
    cross join lateral private.placement_stewards(a.person_id) as s(user_id)
    where a.owner is null
  )
  select
    lower(u.email),
    k.kind,
    case when count(*) = 1 then private.person_label((array_agg(k.person_id))[1]) end,
    count(*)::integer,
    (select t.name from public.trees t where t.id = k.home)
  from asks k
  join auth.users u on u.id = k.user_id
  where u.deleted_at is null
    and coalesce(u.email, '') <> ''
  group by u.email, k.kind, k.home;
$$;

revoke all on function public.placement_ask_recipients(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.placement_ask_recipients(uuid, uuid[]) to service_role;
