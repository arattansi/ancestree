-- Step 14.3 — the gate prompt registers interest instead of provisioning
--
-- Step 14.1 queued a request that an admin approved into a real second tree.
-- That is post-proof-of-concept work: whether we build new trees at all
-- depends on whether there is a market for this. So the prompt stops promising
-- a canvas and starts doing the only job worth doing now — keeping a record of
-- the people who *would* want one, so we can reach out if this goes to market.
--
-- `tree_canvas_requests` and its approve/decline RPCs go (they never held a
-- row); `canvas_interest` replaces them. Nothing here creates a tree.

drop function if exists public.approve_tree_canvas_request(uuid, text, uuid);
drop function if exists public.decline_tree_canvas_request(uuid, text);
drop function if exists public.request_tree_canvas(text);
drop table if exists public.tree_canvas_requests;

-- One notification type, for admins: someone asked.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved',
    'claim_disputed',
    'claim_upheld',
    'claim_reversed',
    'canvas_interest'
  )
);

-- ---------------------------------------------------------------------------
-- canvas_interest — the register
-- ---------------------------------------------------------------------------

create table public.canvas_interest (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique
    references public.profiles (auth_user_id) on delete cascade,
  tree_id uuid not null references public.trees (id) on delete cascade,
  note text,
  -- Outreach state, not an approval workflow: nothing is granted either way.
  status text not null default 'new'
    check (status in ('new', 'contacted', 'dismissed')),
  contacted_by uuid references public.profiles (auth_user_id) on delete set null,
  contacted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index canvas_interest_status_created_idx
  on public.canvas_interest (status, created_at desc);

create trigger canvas_interest_set_updated_at
  before update on public.canvas_interest
  for each row execute function private.set_updated_at();

alter table public.canvas_interest enable row level security;

-- Admins read the register; a member sees only their own row. Rows are written
-- by the SECURITY DEFINER RPCs below (no INSERT policy on purpose).
create policy canvas_interest_select on public.canvas_interest
  for select to authenticated
  using (
    (select private.is_admin())
    or user_id = (select auth.uid())
  );

create policy canvas_interest_delete on public.canvas_interest
  for delete to authenticated
  using ((select private.is_admin()));

revoke all on table public.canvas_interest from anon, public;
grant select, delete on table public.canvas_interest to authenticated;

-- ---------------------------------------------------------------------------
-- public.register_canvas_interest — the prompt's only side effect
-- ---------------------------------------------------------------------------
create or replace function public.register_canvas_interest(
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_self uuid;
  v_tree uuid;
  v_id uuid;
  v_existing uuid;
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

  select id into v_existing from public.canvas_interest where user_id = v_uid;

  -- Asking twice is not an error; it just refreshes what they told us.
  if v_existing is not null then
    update public.canvas_interest
    set note = coalesce(nullif(btrim(p_note), ''), note)
    where id = v_existing;
    return v_existing;
  end if;

  insert into public.canvas_interest (user_id, tree_id, note)
  values (v_uid, v_tree, nullif(btrim(p_note), ''))
  returning id into v_id;

  for v_admin in select auth_user_id from public.profiles where role = 'admin'
  loop
    perform private.notify(
      v_admin, v_uid, 'canvas_interest', v_self, null,
      private.person_label(v_self)
        || ' would like a tree of their own for their side of the family.'
    );
  end loop;

  return v_id;
end;
$$;

revoke all on function public.register_canvas_interest(text) from anon, public;
grant execute on function public.register_canvas_interest(text)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.canvas_interest_register — admin read, with contact details
--
-- The point of the register is being able to reach these people later, so this
-- joins the email `auth.users` holds. Admin-only and SECURITY DEFINER: members
-- never see each other's addresses.
-- ---------------------------------------------------------------------------
create or replace function public.canvas_interest_register()
returns table (
  id uuid,
  user_id uuid,
  display_name text,
  email text,
  person_name text,
  note text,
  status text,
  contacted_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ci.id,
    ci.user_id,
    p.display_name,
    u.email::text,
    private.person_label(p.self_person_id),
    ci.note,
    ci.status,
    ci.contacted_at,
    ci.created_at
  from public.canvas_interest ci
  join public.profiles p on p.auth_user_id = ci.user_id
  left join auth.users u on u.id = ci.user_id
  where private.is_admin()
  order by ci.created_at desc;
$$;

revoke all on function public.canvas_interest_register() from anon, public;
grant execute on function public.canvas_interest_register()
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- public.set_canvas_interest_status — admin marks outreach state
-- ---------------------------------------------------------------------------
create or replace function public.set_canvas_interest_status(
  p_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not private.is_admin() then
    raise exception 'Admins only' using errcode = '42501';
  end if;
  if p_status not in ('new', 'contacted', 'dismissed') then
    raise exception 'Unknown status: %', p_status;
  end if;

  update public.canvas_interest
  set status = p_status,
      contacted_by = case when p_status = 'contacted' then v_uid end,
      contacted_at = case when p_status = 'contacted' then now() end
  where id = p_id;
end;
$$;

revoke all on function public.set_canvas_interest_status(uuid, text)
  from anon, public;
grant execute on function public.set_canvas_interest_status(uuid, text)
  to authenticated, service_role;
