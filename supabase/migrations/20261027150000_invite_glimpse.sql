-- Step 215 (F4 of the 2026-10-27 drop-off audit): the join page shows
-- something of the tree, and a claim link says who its entry is to whoever
-- sent it.
--
-- `invite_glimpse(token)` hands the join page's server what it works that
-- out from, for a live invite into a tree: everyone on the tree (their sex,
-- birthplace and birth date, for the leaf each is drawn as and the row it
-- sits in), the lines between them, the inviter's entry and the entry a
-- claim link hands over, and the inviter's photo unless they hide their
-- entry from visitors. The page passes on only what Aalim allowed anyone
-- holding the link to see (2026-10-27): unnamed leaves by generation, the
-- relation's words and the inviter's photo. So it's for the service role
-- alone: none of this goes to a browser as it comes out of here.
--
-- Live the way `invite_preview` is (same conditions); nothing for a founder
-- invite, whose tree has nobody on it yet.

create or replace function public.invite_glimpse(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with invite as (
    select i.tree_id, i.person_id, i.created_by
    from public.invites i
    where i.token = p_token
      and i.status = 'active'
      and i.archived_at is null
      and not i.founds_tree
      and (i.expires_at is null or i.expires_at > now())
      and (i.max_uses is null or i.use_count < i.max_uses)
  ),
  placed as (
    select pe.*
    from invite i
    join public.tree_placements pl
      on pl.tree_id = i.tree_id and pl.status = 'active'
    join public.people pe on pe.id = pl.person_id
  ),
  -- Whose entry the inviter's is: their own (`self_person_id`) or one
  -- they've claimed, as long as it's on this tree.
  inviter as (
    select pe.*
    from invite i
    join placed pe on pe.id in (
      select pr.self_person_id
      from public.profiles pr
      where pr.auth_user_id = i.created_by
      union
      select c.person_id
      from public.claims c
      where c.claimant_user_id = i.created_by and c.status = 'approved'
    )
    order by pe.id = (
      select pr.self_person_id from public.profiles pr where pr.auth_user_id = i.created_by
    ) desc
    limit 1
  )
  select jsonb_build_object(
    'inviter_person_id', (select id from inviter),
    'inviter_sex', (select sex from inviter),
    'inviter_last_name', (select last_name from inviter),
    'inviter_maiden_name', (select maiden_name from inviter),
    'inviter_photo_path',
      (select photo_path from inviter where not hidden_from_visitors),
    'inviter_photo_crop',
      (select photo_crop from inviter where not hidden_from_visitors),
    'claim_person_id', (select pe.id from invite i join placed pe on pe.id = i.person_id),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'sex', pe.sex,
        'city_of_birth', pe.city_of_birth,
        'country_of_birth', pe.country_of_birth,
        'date_of_birth', pe.date_of_birth,
        'hidden', pe.hidden_from_visitors
      ))
      from placed pe
    ), '[]'::jsonb),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
        'from_person', r.from_person,
        'to_person', r.to_person,
        'type', r.type,
        'is_divorced', r.is_divorced
      ))
      from public.relationships r
      where r.from_person in (select id from placed)
        and r.to_person in (select id from placed)
    ), '[]'::jsonb)
  )
  from invite;
$$;

revoke all on function public.invite_glimpse(text) from public, anon, authenticated;
grant execute on function public.invite_glimpse(text) to service_role;
