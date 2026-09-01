-- Step 14.1 — "Start your own canvas" requests
--
-- The other half of the bloodline gate. When a married-in member is refused,
-- they are not stuck: they can ask for a canvas of their own. Requests land in
-- a pending queue on /admin (same shape as `invite_requests`); approving mints
-- the tree, the requester's entry in it, and the spouse bridge back to the
-- family tree, reusing the Step 9 seam.
--
-- Known limit, unchanged from Step 9: the second canvas is only *rendered* when
-- NEXT_PUBLIC_ENABLE_MULTI_TREE is on, and `add_people_with_connections` still
-- writes to the oldest tree unconditionally. Approving provisions the tree, the
-- entry and the bridge; making that canvas visible and writable is the
-- multi-tree work that is still deferred behind the flag.

-- ---------------------------------------------------------------------------
-- notifications: three more types
-- ---------------------------------------------------------------------------

alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved',
    'claim_disputed',
    'claim_upheld',
    'claim_reversed',
    'canvas_requested',
    'canvas_approved',
    'canvas_declined'
  )
);

-- ---------------------------------------------------------------------------
-- tree_canvas_requests
-- ---------------------------------------------------------------------------

create table public.tree_canvas_requests (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null
    references public.profiles (auth_user_id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  -- The blood relative the requester is married to; the bridge anchors here.
  bridge_person_id uuid references public.people (id) on delete set null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'declined')),
  reviewed_by uuid references public.profiles (auth_user_id) on delete set null,
  reviewed_at timestamptz,
  new_tree_id uuid references public.trees (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One open request per member; resolved ones stay as history.
create unique index tree_canvas_requests_pending_uidx
  on public.tree_canvas_requests (requester_user_id)
  where status = 'pending';

create index tree_canvas_requests_status_created_idx
  on public.tree_canvas_requests (status, created_at desc);

create trigger tree_canvas_requests_set_updated_at
  before update on public.tree_canvas_requests
  for each row execute function private.set_updated_at();

alter table public.tree_canvas_requests enable row level security;

-- Admins see the queue; a member sees only their own. Rows are written by the
-- SECURITY DEFINER RPCs below (no INSERT/UPDATE policy on purpose).
create policy tree_canvas_requests_select on public.tree_canvas_requests
  for select to authenticated
  using (
    (select private.is_admin())
    or requester_user_id = (select auth.uid())
  );

create policy tree_canvas_requests_delete on public.tree_canvas_requests
  for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.tree_canvas_requests from anon, public;
grant select, delete on table public.tree_canvas_requests to authenticated;

-- ---------------------------------------------------------------------------
-- public.request_tree_canvas — a gated member asks for their own canvas
-- ---------------------------------------------------------------------------
create or replace function public.request_tree_canvas(p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_tree uuid;
  v_bridge uuid;
  v_id uuid;
  v_admin uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select self_person_id into v_self
  from public.profiles where auth_user_id = v_uid;
  if v_self is null then
    raise exception 'Add your own entry first' using errcode = '42501';
  end if;

  select tree_id into v_tree from public.people where id = v_self;

  if exists (
    select 1 from public.tree_canvas_requests
    where requester_user_id = v_uid and status = 'pending'
  ) then
    raise exception 'You already have a request waiting on an admin'
      using errcode = 'unique_violation';
  end if;

  -- Anchor the future bridge on the blood partner they married, if there is
  -- one. Left null when there isn't; an admin picks at approval time.
  select case when r.from_person = v_self then r.to_person else r.from_person end
    into v_bridge
  from public.relationships r
  where r.tree_id = v_tree
    and r.type = 'spouse'
    and (r.from_person = v_self or r.to_person = v_self)
    and private.is_bloodline(
      case when r.from_person = v_self then r.to_person else r.from_person end
    )
  order by r.is_divorced asc, r.created_at asc
  limit 1;

  insert into public.tree_canvas_requests
    (requester_user_id, tree_id, bridge_person_id, note)
  values (v_uid, v_tree, v_bridge, nullif(btrim(p_note), ''))
  returning id into v_id;

  for v_admin in select auth_user_id from public.profiles where role = 'admin'
  loop
    perform private.notify(
      v_admin, v_uid, 'canvas_requested', v_self, null,
      private.person_label(v_self)
        || ' asked for a canvas of their own to build their side of the family.'
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.request_tree_canvas(text) from anon, public;
grant execute on function public.request_tree_canvas(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.approve_tree_canvas_request — admin provisions the canvas
--
-- Mirrors `start_own_tree` (Step 9) but acts *for the requester*: the tree is
-- created with them as `created_by` (which is what `private.is_tree_member`
-- reads), their entry on the family tree is copied into it, and the bridge is
-- anchored on the blood partner they married.
-- ---------------------------------------------------------------------------
create or replace function public.approve_tree_canvas_request(
  p_request_id uuid,
  p_tree_name text default null,
  p_bridge_person_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.tree_canvas_requests;
  v_self uuid;
  v_bridge uuid;
  v_name text;
  v_new_tree uuid;
  v_person uuid;
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_req from public.tree_canvas_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'That request no longer exists';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request has already been reviewed';
  end if;

  select self_person_id into v_self
  from public.profiles where auth_user_id = v_req.requester_user_id;
  if v_self is null then
    raise exception 'That member no longer has an entry on the tree';
  end if;

  v_bridge := coalesce(p_bridge_person_id, v_req.bridge_person_id);
  if v_bridge is null then
    raise exception 'Pick the family member this canvas bridges to';
  end if;
  if not exists (
    select 1 from public.people where id = v_bridge and tree_id = v_req.tree_id
  ) then
    raise exception 'That bridge person is not on the family tree';
  end if;

  select coalesce(
    nullif(btrim(p_tree_name), ''),
    nullif(nullif(btrim(pe.last_name), '') || ' family', ' family'),
    'New family tree'
  )
    into v_name
  from public.people pe
  where pe.id = v_self;

  insert into public.trees (name, created_by)
  values (v_name, v_req.requester_user_id)
  returning id into v_new_tree;

  -- Copy their entry onto the new canvas as its first person.
  insert into public.people (
    tree_id, first_name, middle_name, preferred_name, last_name, maiden_name,
    date_of_birth, city_of_birth, country_of_birth, place_id_birth,
    is_deceased, date_of_death, place_of_death, place_id_death, sex,
    created_by, owner_user_id
  )
  select
    v_new_tree, pe.first_name, pe.middle_name, pe.preferred_name, pe.last_name,
    pe.maiden_name, pe.date_of_birth, pe.city_of_birth, pe.country_of_birth,
    pe.place_id_birth, pe.is_deceased, pe.date_of_death, pe.place_of_death,
    pe.place_id_death, pe.sex,
    v_req.requester_user_id, v_req.requester_user_id
  from public.people pe
  where pe.id = v_self
  returning id into v_person;

  insert into public.tree_bridges
    (from_tree, to_tree, from_person, to_person, type, created_by)
  values
    (v_new_tree, v_req.tree_id, v_person, v_bridge, 'spouse',
     v_req.requester_user_id)
  on conflict do nothing;

  update public.tree_canvas_requests
  set status = 'approved',
      reviewed_by = v_uid,
      reviewed_at = now(),
      new_tree_id = v_new_tree,
      bridge_person_id = v_bridge
  where id = p_request_id;

  perform private.notify(
    v_req.requester_user_id, v_uid, 'canvas_approved', v_self, null,
    'Your own canvas is ready. Build your side of the family there and it stays '
      || 'connected to this tree through your marriage.'
  );

  return jsonb_build_object('tree_id', v_new_tree, 'person_id', v_person);
end;
$$;

revoke all on function public.approve_tree_canvas_request(uuid, text, uuid)
  from anon, public;
grant execute on function public.approve_tree_canvas_request(uuid, text, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.decline_tree_canvas_request
-- ---------------------------------------------------------------------------
create or replace function public.decline_tree_canvas_request(
  p_request_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_req public.tree_canvas_requests;
  v_self uuid;
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;

  select * into v_req from public.tree_canvas_requests where id = p_request_id;
  if v_req.id is null then
    raise exception 'That request no longer exists';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'That request has already been reviewed';
  end if;

  update public.tree_canvas_requests
  set status = 'declined', reviewed_by = v_uid, reviewed_at = now()
  where id = p_request_id;

  select self_person_id into v_self
  from public.profiles where auth_user_id = v_req.requester_user_id;

  perform private.notify(
    v_req.requester_user_id, v_uid, 'canvas_declined', v_self, null,
    coalesce(
      nullif(btrim(p_reason), ''),
      'An admin looked at your request for a canvas of your own and declined it '
        || 'for now. Reach out to them if you think that is a mistake.'
    )
  );
end;
$$;

revoke all on function public.decline_tree_canvas_request(uuid, text)
  from anon, public;
grant execute on function public.decline_tree_canvas_request(uuid, text)
  to authenticated, service_role;
