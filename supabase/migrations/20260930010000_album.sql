-- Step 88.5: the album replaces an entry's documents.
--
-- A photo is uploaded once and tagged with the people in it; it shows in
-- each of their albums. Anyone on a tree that shows a person in full may
-- add a photo of them (Aalim, 2026-09-29), and each tag waits for approval
-- on its own, from the same people as a story (Step 88.3):
--   * the person themself, once the entry is claimed (or is their own) and
--     they are living (`private.story_owner`);
--   * else whoever can edit the entry (`private.can_approve_story`).
-- Nobody else sees a photo in someone's album until that tag is approved;
-- its uploader sees their own while it waits, and after, if it was
-- declined. An approved tag shows wherever the entry does in full, to that
-- tree's members (`private.can_see_stories`); not on a share link, and not
-- to visitors (the app shows it neither place). A tag the uploader could
-- approve is approved at once.
--
-- Additive: the deployed app still reads documents. 20260930020000 moves
-- the documents into the album and retires them, once the new app is live.

-- 1. The photos, and who is in each.
create table public.album_photos (
  id uuid primary key default gen_random_uuid(),
  -- The tree it was added on, whose inbox its uploader hears back in.
  tree_id uuid references public.trees (id) on delete set null,
  -- Kept, as nobody's, when its uploader's account goes.
  created_by uuid references public.profiles (auth_user_id) on delete set null,
  -- In the `album` bucket, under the tree it was added on.
  file_path text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint album_photos_file_path_key unique (file_path),
  constraint album_photos_description_check
    check (description is null or length(btrim(description)) between 1 and 500)
);

create index album_photos_tree_idx on public.album_photos (tree_id);
create index album_photos_created_by_idx on public.album_photos (created_by);

create table public.album_tags (
  photo_id uuid not null references public.album_photos (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.profiles (auth_user_id) on delete set null,
  primary key (photo_id, person_id),
  constraint album_tags_status_check
    check (status in ('pending', 'approved', 'declined')),
  constraint album_tags_decided
    check ((status = 'pending') = (decided_at is null))
);

create index album_tags_person_idx on public.album_tags (person_id, created_at desc);
create index album_tags_decided_by_idx on public.album_tags (decided_by);

-- 2. Who sees and tends them. Security definer, so the two tables' rules
-- can ask about each other without either's RLS running inside the other's.

-- May the viewer see a tag: its photo's uploader always; else an approved
-- one to whoever reads the person's stories, a waiting one to whoever
-- approves them.
create or replace function private.can_see_album_tag(p_photo uuid, p_person uuid, p_status text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.album_photos p
      where p.id = p_photo and p.created_by = (select auth.uid())
    )
    or case p_status
      when 'approved' then private.can_see_stories(p_person)
      when 'pending' then private.can_approve_story(p_person)
      else false
    end,
    false
  );
$$;

-- May the viewer see a photo: its uploader, or anyone who sees one of its
-- tags.
create or replace function private.can_see_album_photo(p_photo uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.album_photos p
    where p.id = p_photo and p.created_by = (select auth.uid())
  )
  or exists (
    select 1 from public.album_tags t
    where t.photo_id = p_photo
      and case t.status
        when 'approved' then private.can_see_stories(t.person_id)
        when 'pending' then private.can_approve_story(t.person_id)
        else false
      end
  );
$$;

-- May the viewer take someone out of a photo: its uploader, whoever
-- approves that person's photos, or whoever can edit the entry.
create or replace function private.can_untag(p_photo uuid, p_person uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    exists (
      select 1 from public.album_photos p
      where p.id = p_photo and p.created_by = (select auth.uid())
    )
    or private.can_approve_story(p_person)
    or private.can_edit_person(p_person),
    false
  );
$$;

revoke all on function private.can_see_album_tag(uuid, uuid, text) from public, anon;
revoke all on function private.can_see_album_photo(uuid) from public, anon;
revoke all on function private.can_untag(uuid, uuid) from public, anon;
grant execute on function private.can_see_album_tag(uuid, uuid, text) to authenticated, service_role;
grant execute on function private.can_see_album_photo(uuid) to authenticated, service_role;
grant execute on function private.can_untag(uuid, uuid) to authenticated, service_role;

alter table public.album_photos enable row level security;
alter table public.album_tags enable row level security;

-- Added and decided only through the functions below; a photo deleted by
-- its uploader, a tag removed by whoever may untag it.
revoke all on table public.album_photos from anon, authenticated, public;
revoke all on table public.album_tags from anon, authenticated, public;
grant select, delete on table public.album_photos to authenticated;
grant select, delete on table public.album_tags to authenticated;
grant all on table public.album_photos to service_role;
grant all on table public.album_tags to service_role;

create policy album_photos_select on public.album_photos
  for select to authenticated
  using (
    created_by = (select auth.uid())
    or (select private.can_see_album_photo(album_photos.id))
  );

create policy album_photos_delete on public.album_photos
  for delete to authenticated
  using (created_by = (select auth.uid()));

create policy album_tags_select on public.album_tags
  for select to authenticated
  using ((select private.can_see_album_tag(album_tags.photo_id, album_tags.person_id, album_tags.status)));

create policy album_tags_delete on public.album_tags
  for delete to authenticated
  using ((select private.can_untag(album_tags.photo_id, album_tags.person_id)));

-- A photo nobody is in any more goes: its last tag removed, or its last
-- person deleted. Its file goes with the service role, from the app.
create or replace function private.album_photo_untagged()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.album_photos p
  where p.id = old.photo_id
    and not exists (select 1 from public.album_tags t where t.photo_id = old.photo_id);
  return null;
end;
$$;

revoke all on function private.album_photo_untagged() from public, anon, authenticated;

create trigger album_tags_last_gone
  after delete on public.album_tags
  for each row execute function private.album_photo_untagged();

-- 3. The files: a private bucket, one folder per tree. Uploaded by a member
-- of that tree; read by whoever can see the photo; an upload no photo took
-- is its uploader's to remove. A photo's own file goes with the service
-- role once the photo does.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('album', 'album', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy storage_album_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'album'
    and (select private.is_tree_member(private.uuid_or_null((storage.foldername(objects.name))[1])))
  );

create policy storage_album_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'album'
    and (
      owner_id = (select auth.uid())::text
      or exists (select 1 from public.album_photos p where p.file_path = objects.name)
    )
  );

create policy storage_album_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'album'
    and owner_id = (select auth.uid())::text
    and not exists (select 1 from public.album_photos p where p.file_path = objects.name)
  );

-- 4. What a photo sends: an ask to whoever approves each tag, and their
-- answer to its uploader.
alter table public.notifications drop constraint notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'claim_approved', 'claim_disputed', 'claim_upheld', 'claim_reversed',
    'entry_commented', 'entry_flagged', 'flag_resolved',
    'entry_updated', 'person_added', 'edit_reverted',
    'placement_requested', 'placements_requested',
    'placement_accepted', 'placement_declined', 'placements_lapsed',
    'tree_request_approved', 'placed_on_join', 'joined_by_link',
    'change_suggested', 'suggestion_accepted', 'suggestion_declined',
    'story_to_approve', 'story_approved', 'story_declined', 'story_commented',
    'photo_to_approve', 'photo_approved', 'photo_declined'
  )
);

-- 5. Adding one: a member of the tree it's added on, of people that tree
-- shows in full, with a file they uploaded to that tree's folder. Each
-- approver hears once, however many of the people in it are theirs.
create or replace function public.add_album_photo(
  p_tree uuid,
  p_path text,
  p_description text,
  p_people uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_people uuid[] := array(
    select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) as x where x is not null
  );
  v_pending uuid[] := '{}';
  v_person uuid;
  v_id uuid;
  v_name text;
  v_ask record;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if cardinality(v_people) = 0 then
    raise exception 'ALBUM: nobody in it' using errcode = '22023';
  end if;
  if cardinality(v_people) > 20 then
    raise exception 'ALBUM: too many people' using errcode = '22023';
  end if;
  if length(v_desc) > 500 then
    raise exception 'ALBUM: longer than a description may be' using errcode = '22001';
  end if;
  if not private.is_tree_member(p_tree)
     or exists (select 1 from unnest(v_people) as x where not private.is_placed_in_full(p_tree, x)) then
    raise exception 'ALBUM: not on your tree' using errcode = '42501';
  end if;
  if not exists (
    select 1 from storage.objects o
    where o.bucket_id = 'album'
      and o.name = p_path
      and o.owner_id = v_uid::text
      and (storage.foldername(o.name))[1] = p_tree::text
  ) then
    raise exception 'ALBUM: that photo didn''t arrive' using errcode = '22023';
  end if;

  insert into public.album_photos (tree_id, created_by, file_path, description)
  values (p_tree, v_uid, p_path, v_desc)
  returning id into v_id;

  foreach v_person in array v_people loop
    if private.can_approve_story(v_person) then
      insert into public.album_tags (photo_id, person_id, status, decided_at, decided_by)
      values (v_id, v_person, 'approved', now(), v_uid);
    else
      insert into public.album_tags (photo_id, person_id) values (v_id, v_person);
      v_pending := v_pending || v_person;
    end if;
  end loop;

  if cardinality(v_pending) > 0 then
    v_name := coalesce(private.member_label(v_uid), 'A relative');
    -- Asked of the person themself, on a tree of theirs that shows them
    -- (this one if they're on it); or, for an entry nobody is behind, of
    -- its owner, the Roots of its home tree and the Branches there who tend
    -- it, as a suggested change is (Step 68). One notice a recipient.
    for v_ask in
      with asks as (
        select x as person, private.story_owner(x) as recipient, true as is_self,
          (
            select pl.tree_id
            from public.tree_placements pl
            join public.tree_members m
              on m.tree_id = pl.tree_id and m.user_id = private.story_owner(x)
            where pl.person_id = x and pl.status = 'active' and pl.detail = 'full'
            order by (pl.tree_id = p_tree) desc, (pl.tree_id = private.home_tree(x)) desc
            limit 1
          ) as tree
        from unnest(v_pending) as x
        where private.story_owner(x) is not null
        union all
        select x, r.user_id, false, private.home_tree(x)
        from unnest(v_pending) as x
        cross join lateral (
          select pe.owner_user_id as user_id from public.people pe where pe.id = x
          union
          select m.user_id from public.tree_members m
          where m.tree_id = private.home_tree(x) and m.role = 'admin'
          union
          select b.user_id from private.tending_branches(x) as b(user_id)
        ) r
        where private.story_owner(x) is null
      )
      select a.recipient,
        (array_agg(a.person order by a.is_self desc, a.person))[1] as person,
        (array_agg(a.is_self order by a.is_self desc, a.person))[1] as is_self,
        (array_agg(a.tree order by a.is_self desc, a.person))[1] as tree,
        count(distinct a.person) as n
      from asks a
      where a.recipient is not null
      group by a.recipient
    loop
      perform private.notify(
        v_ask.recipient, v_uid, 'photo_to_approve', v_ask.person, null,
        v_name || ' added a photo of '
          || case when v_ask.is_self then 'you' else private.person_label(v_ask.person) end
          || case
               when v_ask.n = 2 then ' and 1 other'
               when v_ask.n > 2 then ' and ' || (v_ask.n - 1) || ' others'
               else ''
             end
          || ', waiting for your approval.',
        coalesce(v_ask.tree, private.home_tree(v_ask.person))
      );
    end loop;
  end if;

  return jsonb_build_object('id', v_id, 'pending', cardinality(v_pending));
end;
$$;

revoke all on function public.add_album_photo(uuid, text, text, uuid[]) from public, anon;
grant execute on function public.add_album_photo(uuid, text, text, uuid[]) to authenticated;

-- 6. A tag approved or declined by whoever approves the person's photos;
-- the uploader is told. A declined one stays for the uploader alone.
create or replace function public.decide_album_tag(p_photo uuid, p_person uuid, p_approve boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_status text;
  v_uploader uuid;
  v_tree uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select t.status, p.created_by, p.tree_id into v_status, v_uploader, v_tree
  from public.album_tags t
  join public.album_photos p on p.id = t.photo_id
  where t.photo_id = p_photo and t.person_id = p_person;
  if not found or v_status <> 'pending' then
    raise exception 'ALBUM: already decided' using errcode = '22023';
  end if;
  if not private.can_approve_story(p_person) then
    raise exception 'ALBUM: not yours to approve' using errcode = '42501';
  end if;

  update public.album_tags
  set status = case when p_approve then 'approved' else 'declined' end,
    decided_at = now(),
    decided_by = v_uid
  where photo_id = p_photo and person_id = p_person;

  perform private.notify(
    v_uploader, v_uid,
    case when p_approve then 'photo_approved' else 'photo_declined' end,
    p_person, null,
    'Your photo of ' || private.person_label(p_person)
      || case when p_approve then ' was approved.' else ' wasn''t approved.' end,
    v_tree
  );
end;
$$;

revoke all on function public.decide_album_tag(uuid, uuid, boolean) from public, anon;
grant execute on function public.decide_album_tag(uuid, uuid, boolean) to authenticated;

-- 7. Someone's album for their details, in one call: the photos they're in
-- that the viewer may see (the tables' own rules decide: this runs as
-- them), newest first, each with who added it, this tag's state, what the
-- viewer may do with it, and the others in it the viewer may see.
create or replace function public.entry_album(p_person uuid)
returns table (
  id uuid,
  file_path text,
  description text,
  created_at timestamptz,
  created_by uuid,
  added_by text,
  status text,
  can_decide boolean,
  can_untag boolean,
  others jsonb
)
language sql
stable
security invoker
set search_path = ''
as $$
  select p.id, p.file_path, p.description, p.created_at, p.created_by,
    private.member_label(p.created_by),
    t.status,
    t.status = 'pending' and private.can_approve_story(t.person_id),
    private.can_untag(t.photo_id, t.person_id),
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object('id', o.person_id, 'name', private.person_label(o.person_id), 'status', o.status)
          order by private.person_label(o.person_id)
        )
        from public.album_tags o
        where o.photo_id = p.id and o.person_id <> t.person_id
      ),
      '[]'::jsonb
    )
  from public.album_tags t
  join public.album_photos p on p.id = t.photo_id
  where t.person_id = p_person
  order by p.created_at desc;
$$;

revoke all on function public.entry_album(uuid) from public, anon;
grant execute on function public.entry_album(uuid) to authenticated;

-- 8. Photos count wherever stories do: someone else's photo of an entry
-- keeps a Leaf from deleting it and a placeholder from merging away, a
-- merge moves the tags along, and the dashboard counts them. Each function
-- gains the album's lines; 20260930020000 drops the documents' lines.
CREATE OR REPLACE FUNCTION private.can_delete_person(p_person_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with h as (select private.home_tree(p_person_id) as tree)
  select coalesce(
    private.is_root_of(h.tree)
    or (
      private.role_in(h.tree) in ('branch_admin', 'member')
      and p_person_id is distinct from private.self_person_id()
      and not private.person_is_someones_own(p_person_id)
      and exists (
        select 1 from public.people pe
        where pe.id = p_person_id
          and pe.created_by = (select auth.uid())
          and pe.owner_user_id = pe.created_by
      )
      and not exists (select 1 from public.claims c where c.person_id = p_person_id)
      and not exists (
        select 1 from public.relationships r
        where (r.from_person = p_person_id or r.to_person = p_person_id)
          and r.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.stories s
        where s.person_id = p_person_id and s.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.documents d
        where d.person_id = p_person_id and d.uploaded_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.album_tags t
        join public.album_photos p on p.id = t.photo_id
        where t.person_id = p_person_id and p.created_by is distinct from (select auth.uid())
      )
      and not exists (
        select 1 from public.pet_companions pc
        join public.pets pt on pt.id = pc.pet_id
        where pc.person_id = p_person_id and pt.created_by is distinct from (select auth.uid())
      )
      -- Nobody else's tree has taken them in.
      and not exists (
        select 1 from public.tree_placements pl
        where pl.person_id = p_person_id and pl.tree_id <> h.tree
      )
    ),
    false
  )
  from h;
$function$;

CREATE OR REPLACE FUNCTION private.is_own_placeholder(p_person uuid, p_user uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      select 1 from public.stories s
      where s.person_id = p_person and s.created_by is distinct from p_user
    )
    and not exists (
      select 1 from public.album_tags t
      join public.album_photos p on p.id = t.photo_id
      where t.person_id = p_person and p.created_by is distinct from p_user
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
$function$;

CREATE OR REPLACE FUNCTION public.claim_person(p_person_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  update public.stories set person_id = p_person_id where person_id = v_self;
  -- The photos it's in (Step 88.5), but for those the claimed entry is in
  -- already.
  delete from public.album_tags t
  where t.person_id = v_self
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_person_id
    );
  update public.album_tags set person_id = p_person_id where person_id = v_self;
  update public.entry_reports set person_id = p_person_id where person_id = v_self;
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
$function$;

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
  update public.stories set person_id = p_own where person_id = p_invited;
  -- The photos it's in (Step 88.5), but for those theirs is in already.
  delete from public.album_tags t
  where t.person_id = p_invited
    and exists (
      select 1 from public.album_tags o
      where o.photo_id = t.photo_id and o.person_id = p_own
    );
  update public.album_tags set person_id = p_own where person_id = p_invited;
  update public.entry_reports set person_id = p_own where person_id = p_invited;
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
$function$;

CREATE OR REPLACE FUNCTION public.engagement_dashboard()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_today date := private.utc_day(now());
  -- The last seven days, today included; the seven before them; the last 30.
  v_week_start date := v_today - 6;
  v_prev_start date := v_today - 13;
  v_month_start date := v_today - 29;
begin
  if not private.is_beta_reviewer() then
    raise exception 'NOT_A_REVIEWER' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'today', v_today,
    'members', (select count(*) from public.profiles),
    'members_new', (
      select count(*) from public.profiles p
      where private.utc_day(p.created_at) >= v_week_start),
    'active_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_week_start),
    'active_prev_7', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_prev_start and a.day < v_week_start),
    'active_30', (
      select count(distinct a.user_id) from private.active_days a
      where a.day >= v_month_start),
    'entries', (select count(*) from public.people),
    'entries_new', (
      select count(*) from public.people p
      where private.utc_day(p.created_at) >= v_week_start),

    -- Twelve weeks, oldest first.
    'weeks', (
      select jsonb_agg(jsonb_build_object(
          'end', w.last_day,
          'active', (
            select count(distinct a.user_id) from private.active_days a
            where a.day between w.last_day - 6 and w.last_day),
          'joined', (
            select count(*) from public.profiles p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day),
          'entries', (
            select count(*) from public.people p
            where private.utc_day(p.created_at) between w.last_day - 6 and w.last_day))
        order by w.last_day)
      from (select v_today - 7 * g as last_day from generate_series(0, 11) g) w),

    -- How many members have done each thing at least once.
    'progress', jsonb_build_object(
      'own_entry', (
        select count(*) from public.profiles p where p.self_person_id is not null),
      'added_relative', (
        select count(distinct e.created_by)
        from public.people e
        join public.profiles p on p.auth_user_id = e.created_by
        where e.id is distinct from p.self_person_id),
      'invited', (
        select count(distinct s.user_id)
        from (
          -- An invite sent by email, or a request for access let in.
          select q.reviewed_by as user_id from public.invite_requests q
          where q.status = 'approved'
          union all
          -- Any link still out: family, founder, or an older bare one.
          select i.created_by from public.invites i
        ) s
        join public.profiles p on p.auth_user_id = s.user_id),
      'came_back', (
        select count(*) from (
          select a.user_id from private.active_days a
          group by a.user_id
          having count(*) >= 2) s)),

    -- What was done, by kind: in the last seven days, the seven before,
    -- and ever. A kind nothing has happened to is left out.
    'activity', (
      select coalesce(jsonb_object_agg(k.kind, k.counts), '{}'::jsonb)
      from (
        select e.kind, jsonb_build_object(
            'last_7', count(*) filter (where e.day >= v_week_start),
            'prev_7', count(*) filter (
              where e.day >= v_prev_start and e.day < v_week_start),
            'total', count(*)) as counts
        from (
          select 'entries' as kind, private.utc_day(p.created_at) as day
          from public.people p
          union all select 'connections', private.utc_day(r.created_at)
          from public.relationships r
          union all select 'photos', private.utc_day(o.created_at)
          from storage.objects o where o.bucket_id = 'photos'
          union all select 'documents', private.utc_day(d.created_at)
          from public.documents d
          union all select 'album', private.utc_day(a.created_at)
          from public.album_photos a
          union all select 'stories', private.utc_day(s.created_at)
          from public.stories s
          union all select 'story_comments', private.utc_day(c.created_at)
          from public.story_comments c
          union all select 'comments', private.utc_day(c.created_at)
          from public.pet_comments c
          union all select 'companions', private.utc_day(p.created_at)
          from public.pets p
          union all select 'claims', private.utc_day(c.created_at)
          from public.claims c
          union all select 'invites', private.utc_day(coalesce(q.reviewed_at, q.created_at))
          from public.invite_requests q where q.status = 'approved'
          union all select 'joins', private.utc_day(m.created_at)
          from public.tree_members m
          union all select 'access_requests', private.utc_day(q.created_at)
          from public.invite_requests q where q.source is distinct from 'direct'
          union all select 'tree_requests', private.utc_day(q.created_at)
          from public.tree_requests q
          union all select 'relayed_asks', private.utc_day(r.created_at)
          from public.invite_relays r
        ) e
        group by e.kind
      ) k),

    -- Each tree, oldest first. Its members' days count wherever they
    -- spent them; its entries are what it shows, from other trees too.
    'trees', (
      select coalesce(jsonb_agg(jsonb_build_object(
          'id', t.id,
          'name', t.name,
          'founded', private.utc_day(t.created_at),
          'members', (
            select count(*) from public.tree_members m where m.tree_id = t.id),
          'active_7', (
            select count(distinct m.user_id)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id and a.day >= v_week_start),
          'entries', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'),
          'added_7', (
            select count(*) from public.tree_placements pl
            where pl.tree_id = t.id and pl.status = 'active'
              and private.utc_day(pl.created_at) >= v_week_start),
          'last_active', (
            select max(a.day)
            from public.tree_members m
            join private.active_days a on a.user_id = m.user_id
            where m.tree_id = t.id))
        order by t.created_at), '[]'::jsonb)
      from public.trees t)
  );
end;
$function$;
