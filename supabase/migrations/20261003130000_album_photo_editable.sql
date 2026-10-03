-- Step 114: a photo's uploader edits its description and who's in it.
--
-- Aalim asked (2026-10-03): "let the uploader edit a photo's description and
-- tags later". `edit_album_photo` takes the photo's whole new description
-- and list of people, from its uploader alone:
--
--   * Someone newly in it is tagged as `add_album_photo` tags them: approved
--     at once where the uploader could approve it, else waiting, and asked.
--     They must be on the tree it's edited from, in full; someone already in
--     it may stay wherever they are.
--   * Someone left out is untagged, as the uploader may already do one at a
--     time (`private.can_untag`). The app always keeps the album it's edited
--     from, so the photo is never left with nobody in it (which deletes it).
--   * New words from the uploader go back to anyone else who approved the
--     old ones, as a story's new words do (Step 99.7): those tags wait again
--     and their approvers are asked again. Who's in it alone changes nothing
--     already approved.
--
-- Additive: one new function and one helper, so it goes live before the code.

-- Asks for the photo's tags of `p_people` to be approved, one notice a
-- recipient: the person themself, on a tree of theirs that shows them (this
-- one if they're on it); or, for an entry nobody is behind, its owner, the
-- Roots of its home tree and the Branches there who tend it (Step 68). The
-- same asking as `add_album_photo`'s (20260930030000), where `p_verb` is
-- "added"; here also "edited".
create function private.ask_photo_approval(p_people uuid[], p_tree uuid, p_verb text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_name text := coalesce(private.member_label(v_uid), 'A relative');
  v_ask record;
begin
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
      from unnest(p_people) as x
      where private.story_owner(x) is not null
      union all
      select x, r.user_id, false, private.home_tree(x)
      from unnest(p_people) as x
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
      v_name || ' ' || p_verb || ' a photo of '
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
end;
$$;

revoke all on function private.ask_photo_approval(uuid[], uuid, text) from public, anon, authenticated;

create function public.edit_album_photo(
  p_photo uuid,
  p_tree uuid,
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
  v_photo public.album_photos%rowtype;
  v_desc text := nullif(btrim(coalesce(p_description, '')), '');
  v_people uuid[] := array(
    select distinct x from unnest(coalesce(p_people, '{}'::uuid[])) as x where x is not null
  );
  v_new uuid[] := '{}';
  v_again uuid[] := '{}';
  v_person uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  select * into v_photo from public.album_photos where id = p_photo;
  if not found or v_photo.created_by is distinct from v_uid then
    raise exception 'ALBUM: not yours to edit' using errcode = '42501';
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
  -- Someone newly in it is on the tree it's edited from, in full.
  if exists (
    select 1 from unnest(v_people) as x
    where not exists (
      select 1 from public.album_tags t where t.photo_id = p_photo and t.person_id = x
    )
    and not (private.is_tree_member(p_tree) and private.is_placed_in_full(p_tree, x))
  ) then
    raise exception 'ALBUM: not on your tree' using errcode = '42501';
  end if;

  -- New words: whoever else approved the old ones is asked again.
  if v_desc is distinct from v_photo.description then
    update public.album_photos set description = v_desc where id = p_photo;
    with again as (
      update public.album_tags t
      set status = 'pending', decided_at = null, decided_by = null
      where t.photo_id = p_photo
        and t.status = 'approved'
        and t.person_id = any (v_people)
        and not private.can_approve_story(t.person_id)
      returning t.person_id
    )
    select coalesce(array_agg(person_id), '{}') into v_again from again;
  end if;

  -- Tagged before anyone's untagged, so it's never left with nobody in it.
  foreach v_person in array v_people loop
    if not exists (
      select 1 from public.album_tags t where t.photo_id = p_photo and t.person_id = v_person
    ) then
      if private.can_approve_story(v_person) then
        insert into public.album_tags (photo_id, person_id, status, decided_at, decided_by)
        values (p_photo, v_person, 'approved', now(), v_uid);
      else
        insert into public.album_tags (photo_id, person_id) values (p_photo, v_person);
        v_new := v_new || v_person;
      end if;
    end if;
  end loop;

  delete from public.album_tags t
  where t.photo_id = p_photo and not (t.person_id = any (v_people));

  if cardinality(v_new) > 0 then
    perform private.ask_photo_approval(v_new, p_tree, 'added');
  end if;
  if cardinality(v_again) > 0 then
    perform private.ask_photo_approval(v_again, p_tree, 'edited');
  end if;

  return jsonb_build_object('pending', cardinality(v_new) + cardinality(v_again));
end;
$$;

revoke all on function public.edit_album_photo(uuid, uuid, text, uuid[]) from public, anon;
grant execute on function public.edit_album_photo(uuid, uuid, text, uuid[]) to authenticated;
