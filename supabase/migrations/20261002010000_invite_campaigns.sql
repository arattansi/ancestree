-- Step 103.3: invite-link campaigns. A beta reviewer makes an open link
-- (`/start/<code>`) and notes where it's posted; anyone who opens it can
-- sign up and start a tree of their own at once, with no tree request and
-- no approval. Each link counts its opens, its sign-ups (new accounts) and
-- the trees founded through it, and can be paused and resumed.
--
-- Only counts are kept: nothing records who came in through which link.
-- The table has RLS on and no policies, so it's reached only through the
-- functions below: the reviewers' (`list_campaigns`, `create_campaign`,
-- `update_campaign`, `set_campaign_paused`), the link's page counting an
-- open with the service role (`campaign_open`), and the sign-up itself
-- (`redeem_campaign`).

-- A tree whose name another tree's slug has taken gets a random suffix,
-- but `gen_random_bytes` lives in `extensions`, off these functions' empty
-- search_path, so founding a second "Family" (every campaign sign-up's
-- first tree name) or renaming onto a taken name failed. Bodies as in
-- 20260922090000_trees_have_members, with only that call qualified.
create or replace function private.found_tree_for(p_user uuid, p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_slug text;
  v_tree public.trees;
begin
  if v_name is null then
    raise exception 'Name your tree' using errcode = '22023';
  end if;
  if exists (select 1 from public.trees t where t.created_by = p_user) then
    raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
  end if;

  v_slug := coalesce(private.slugify(v_name), 'tree');
  if exists (select 1 from public.trees t where t.slug = v_slug) then
    v_slug := v_slug || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4);
  end if;

  insert into public.trees (name, slug, created_by)
  values (v_name, v_slug, p_user)
  returning * into v_tree;

  perform private.join_tree(v_tree.id, p_user, 'admin', null);
  return v_tree;
end;
$$;

create or replace function public.rename_tree(p_tree uuid, p_name text)
returns public.trees
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(btrim(p_name), '');
  v_slug text;
  v_tree public.trees;
begin
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can rename a tree' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'Name your tree' using errcode = '22023';
  end if;
  v_slug := coalesce(private.slugify(v_name), 'tree');
  if exists (select 1 from public.trees t where t.slug = v_slug and t.id <> p_tree) then
    v_slug := v_slug || '-' || substr(encode(extensions.gen_random_bytes(3), 'hex'), 1, 4);
  end if;
  update public.trees set name = v_name, slug = v_slug where id = p_tree
  returning * into v_tree;
  return v_tree;
end;
$$;

create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  -- The link's secret part: 12 random hex digits, so links can't be
  -- guessed from one another.
  code text not null unique
    default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  name text not null,
  -- Where the link is posted.
  placement text,
  opens integer not null default 0,
  signups integer not null default 0,
  trees_founded integer not null default 0,
  paused_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint campaigns_name_check
    check (name is not null and char_length(btrim(name)) between 1 and 80),
  constraint campaigns_placement_check
    check (placement is null or char_length(placement) <= 500)
);

alter table public.campaigns enable row level security;
revoke all on public.campaigns from anon, authenticated;

-- The reviewers' list, newest first, with its counts.
create or replace function public.list_campaigns()
returns setof public.campaigns
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  return query
    select * from public.campaigns c order by c.created_at desc;
end;
$$;

create or replace function public.create_campaign(p_name text, p_placement text default null)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  insert into public.campaigns (name, placement, created_by)
  values (btrim(p_name), nullif(btrim(p_placement), ''), (select auth.uid()))
  returning * into v_campaign;
  return v_campaign;
end;
$$;

create or replace function public.update_campaign(p_id uuid, p_name text, p_placement text)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  update public.campaigns
  set name = btrim(p_name), placement = nullif(btrim(p_placement), '')
  where id = p_id
  returning * into v_campaign;
  if v_campaign.id is null then
    raise exception 'NO_CAMPAIGN' using errcode = 'P0002';
  end if;
  return v_campaign;
end;
$$;

create or replace function public.set_campaign_paused(p_id uuid, p_paused boolean)
returns public.campaigns
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_campaign public.campaigns;
begin
  if not private.is_beta_reviewer() then
    raise exception 'REVIEWERS_ONLY' using errcode = '42501';
  end if;
  update public.campaigns
  set paused_at = case when p_paused then coalesce(paused_at, now()) else null end
  where id = p_id
  returning * into v_campaign;
  if v_campaign.id is null then
    raise exception 'NO_CAMPAIGN' using errcode = 'P0002';
  end if;
  return v_campaign;
end;
$$;

-- The link's page, opened: counted, paused or not, and answered with
-- whether it's taking sign-ups ('open'), paused ('paused'), or no link at
-- all (null). Service role only: the page calls it, crawlers aside.
create or replace function public.campaign_open(p_code text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paused timestamptz;
begin
  update public.campaigns
  set opens = opens + 1
  where code = p_code
  returning paused_at into v_paused;
  if not found then
    return null;
  end if;
  return case when v_paused is null then 'open' else 'paused' end;
end;
$$;

-- Sign up through a campaign link: a profile if they have none (a sign-up),
-- and a tree of their own with them as its Root, as a founder invite gives,
-- but with no invite and no approval. Anyone may found only one tree
-- (`found_tree_for`). Their asks to start a tree are answered by it, so any
-- still pending go. Answered as `redeem_invite_tree` answers, for the app
-- to land them the same way.
create or replace function public.redeem_campaign(p_code text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_email text;
  v_campaign public.campaigns;
  v_profile public.profiles;
  v_tree public.trees;
  v_new_profile boolean := false;
  v_had_entry boolean := false;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_campaign
  from public.campaigns
  where code = p_code and paused_at is null
  for update;
  if not found then
    raise exception 'CAMPAIGN_CLOSED: this link is not taking sign-ups' using errcode = '22023';
  end if;

  if exists (select 1 from public.trees t where t.created_by = v_uid) then
    raise exception 'ONE_TREE_EACH: you have already founded a tree' using errcode = '23505';
  end if;

  v_email := private.current_email();

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  select * into v_profile from public.profiles where auth_user_id = v_uid;
  if found then
    v_had_entry := v_profile.self_person_id is not null;
  else
    insert into public.profiles (auth_user_id, display_name)
    values (v_uid, coalesce(nullif(btrim(p_display_name), ''), split_part(v_email, '@', 1)))
    returning * into v_profile;
    v_new_profile := true;
  end if;

  v_tree := private.found_tree_for(v_uid, private.default_tree_name(v_uid));

  update public.campaigns
  set signups = signups + case when v_new_profile then 1 else 0 end,
      trees_founded = trees_founded + 1
  where id = v_campaign.id;

  delete from public.tree_requests r
  where r.status = 'pending'
    and (r.user_id = v_uid or (r.user_id is null and lower(r.email) = lower(v_email)));

  perform set_config('ancestree.privileged_profile_write', '', true);

  return jsonb_build_object(
    'tree_id', v_tree.id, 'tree_slug', v_tree.slug, 'tree_name', v_tree.name,
    'self_person_id', v_profile.self_person_id,
    'self_placed', false,
    'claim_invite', false,
    'had_entry', v_had_entry,
    'was_member', false
  );
end;
$$;

revoke all on function public.list_campaigns() from public, anon;
revoke all on function public.create_campaign(text, text) from public, anon;
revoke all on function public.update_campaign(uuid, text, text) from public, anon;
revoke all on function public.set_campaign_paused(uuid, boolean) from public, anon;
revoke all on function public.campaign_open(text) from public, anon, authenticated;
revoke all on function public.redeem_campaign(text, text) from public, anon;

grant execute on function public.list_campaigns() to authenticated;
grant execute on function public.create_campaign(text, text) to authenticated;
grant execute on function public.update_campaign(uuid, text, text) to authenticated;
grant execute on function public.set_campaign_paused(uuid, boolean) to authenticated;
grant execute on function public.campaign_open(text) to service_role;
grant execute on function public.redeem_campaign(text, text) to authenticated;
