-- Step 88.6: when an album photo was taken. The browser reads it from the
-- photo itself before shrinking it (EXIF's date taken, or a date written
-- into its XMP or IPTC later, such as a scan's "1962"), or it's typed in;
-- kept as much as is known, as a person's dates are (Step 17): "1962" is
-- 1962-01-01 at 'year'. Nothing else a photo says is kept: the names in it
-- only suggest who to tag, in the browser, and where it was taken is never
-- read. Additive, so it goes live before the code that sends the date.

-- 1. The date.
alter table public.album_photos
  add column taken_on date,
  add column taken_on_precision text;

alter table public.album_photos
  add constraint album_photos_taken_check check (
    (taken_on is null and taken_on_precision is null)
    or (
      taken_on is not null
      and taken_on_precision is not null
      and taken_on_precision in ('day', 'month', 'year')
      and taken_on >= date '1000-01-01'
      and (taken_on_precision = 'day' or extract(day from taken_on) = 1)
      and (taken_on_precision <> 'year' or extract(month from taken_on) = 1)
    )
  );

-- 2. Adding a photo takes its date. The four-argument version goes, so a
-- call naming only those four (the code before this) finds this one.
drop function public.add_album_photo(uuid, text, text, uuid[]);

create function public.add_album_photo(
  p_tree uuid,
  p_path text,
  p_description text,
  p_people uuid[],
  p_taken_on date default null,
  p_taken_precision text default null
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
  v_taken date := p_taken_on;
  v_precision text := case when p_taken_on is null then null else coalesce(p_taken_precision, 'day') end;
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
  if v_taken is not null then
    if v_precision not in ('day', 'month', 'year') then
      raise exception 'ALBUM: not a date taken' using errcode = '22023';
    end if;
    -- Kept on the first day of as much of it as is known.
    v_taken := case v_precision
      when 'year' then date_trunc('year', v_taken)::date
      when 'month' then date_trunc('month', v_taken)::date
      else v_taken
    end;
    -- A day ahead: somewhere, it's already tomorrow.
    if v_taken > current_date + 1 then
      raise exception 'ALBUM: taken after today' using errcode = '22023';
    end if;
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

  insert into public.album_photos (tree_id, created_by, file_path, description, taken_on, taken_on_precision)
  values (p_tree, v_uid, p_path, v_desc, v_taken, v_precision)
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

revoke all on function public.add_album_photo(uuid, text, text, uuid[], date, text) from public, anon;
grant execute on function public.add_album_photo(uuid, text, text, uuid[], date, text) to authenticated;

-- 3. An album reads it back. Its columns change, so it's made again.
drop function public.entry_album(uuid);

create function public.entry_album(p_person uuid)
returns table (
  id uuid,
  file_path text,
  description text,
  taken_on date,
  taken_on_precision text,
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
  select p.id, p.file_path, p.description, p.taken_on, p.taken_on_precision,
    p.created_at, p.created_by,
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
