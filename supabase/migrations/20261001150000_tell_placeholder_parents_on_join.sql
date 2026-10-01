-- Step 98.2 follow-up: tell the parent about the placeholder when they join.
--
-- 98.2 told a parent about a placeholder child only if they were a member
-- when it was made; a parent who joined later (by the claim invite to their
-- own entry, "This is me", a claim approved, a merge) found it unannounced.
-- Now a parent is told once per placeholder, whenever their entry first
-- becomes a member's own while a placeholder waits under it, and whenever a
-- parent line to a waiting placeholder is drawn or moved onto a member's
-- entry:
--   * `private.tell_placeholder_parent(parent)`: one `placeholder_child`
--     notice per member and placeholder, from whoever made it;
--   * after-triggers on `profiles` (`self_person_id` set), `claims` (status
--     approved) and `relationships` (a parent line to a placeholder, drawn
--     or moved: merges move lines by update);
--   * `add_placeholder_child` leaves its member notice to the trigger.

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
      coalesce(private.member_label(v_child.created_by), 'A Root')
        || ' added a placeholder for your child ('
        || private.placeholder_label(v_child.placeholder_number)
        || '). Only you can fill it in.',
      v_child.tree_id
    );
  end loop;
end;
$$;

create or replace function private.profiles_tell_placeholder_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.tell_placeholder_parent(new.self_person_id);
  return null;
end;
$$;

create or replace function private.claims_tell_placeholder_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.tell_placeholder_parent(new.person_id);
  return null;
end;
$$;

create or replace function private.relationships_tell_placeholder_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.is_placeholder(new.to_person) then
    perform private.tell_placeholder_parent(new.from_person);
  end if;
  return null;
end;
$$;

revoke all on function private.tell_placeholder_parent(uuid) from public, anon, authenticated;
revoke all on function private.profiles_tell_placeholder_parent() from public, anon, authenticated;
revoke all on function private.claims_tell_placeholder_parent() from public, anon, authenticated;
revoke all on function private.relationships_tell_placeholder_parent() from public, anon, authenticated;

create trigger profiles_tell_placeholder_parent
  after insert or update of self_person_id on public.profiles
  for each row
  when (new.self_person_id is not null)
  execute function private.profiles_tell_placeholder_parent();
create trigger claims_tell_placeholder_parent
  after insert or update of status on public.claims
  for each row
  when (new.status = 'approved')
  execute function private.claims_tell_placeholder_parent();
create trigger relationships_tell_placeholder_parent
  after insert or update of from_person, to_person, type on public.relationships
  for each row
  when (new.type = 'parent')
  execute function private.relationships_tell_placeholder_parent();

create or replace function public.add_placeholder_child(p_tree uuid, p_parents uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_parent uuid;
  v_number smallint;
  v_id uuid;
  v_outside uuid[];
  v_member uuid;
  v_uninvited uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if p_tree is null or not private.is_tree_member(p_tree) then
    raise exception 'You are not a member of this tree' using errcode = '42501';
  end if;
  if private.role_in(p_tree) not in ('admin', 'branch_admin') then
    raise exception 'PLACEHOLDER: only a Root or a Branch adds a placeholder child'
      using errcode = '42501';
  end if;
  if p_parents is null or cardinality(p_parents) not between 1 and 2
     or p_parents[1] is null or p_parents[cardinality(p_parents)] is null
     or (cardinality(p_parents) = 2 and p_parents[1] = p_parents[2]) then
    raise exception 'PLACEHOLDER: name one or two parents' using errcode = '22023';
  end if;

  -- One at a time per family, so two never take the same number.
  perform 1 from public.people pe
  where pe.id = any(p_parents)
  order by pe.id
  for update;

  foreach v_parent in array p_parents loop
    if not private.is_placed(p_tree, v_parent)
       or private.is_placeholder(v_parent) then
      raise exception 'PLACEHOLDER: their parent isn''t on this tree'
        using errcode = '42501';
    end if;
  end loop;
  if not exists (
    select 1 from public.people pe
    where pe.id = any(p_parents) and not pe.is_deceased and pe.date_of_death is null
  ) then
    raise exception 'PLACEHOLDER: a placeholder needs a living parent to fill it in'
      using errcode = '23514';
  end if;

  select coalesce(max(c.placeholder_number), 0) + 1 into v_number
  from public.relationships r
  join public.people c on c.id = r.to_person
  where r.type = 'parent' and r.from_person = any(p_parents)
    and c.placeholder_number is not null;

  insert into public.people (
    tree_id, first_name, last_name, country_of_birth, is_deceased,
    placeholder_number, created_by, owner_user_id
  ) values (
    p_tree, null, '', '', false, v_number, v_uid, v_uid
  )
  returning id into v_id;

  -- Its parent lines are this call's to judge, not the "18 or older?"
  -- question a first line to a child otherwise asks (Step 98.1).
  perform private.note_new_people(array[v_id]);
  insert into public.relationships (tree_id, from_person, to_person, type, created_by)
  select p_tree, x, v_id, 'parent', v_uid
  from unnest(p_parents) as x;
  perform private.note_new_people(null);

  perform private.assert_tree_consistent(p_tree);

  v_outside := private.without_blood_tie(p_tree, array[v_id]);
  if cardinality(v_outside) > 0 then
    raise exception 'BLOODLINE_GATE: % has no blood tie to this tree',
      private.placeholder_label(v_number)
      using errcode = '42501', detail = 'new:0';
  end if;

  foreach v_parent in array p_parents loop
    continue when exists (
      select 1 from public.people pe
      where pe.id = v_parent and (pe.is_deceased or pe.date_of_death is not null)
    );
    -- A member parent was told as its line was drawn
    -- (`relationships_tell_placeholder_parent`).
    v_member := private.person_owner_member(v_parent);
    if v_member is null then
      v_uninvited := array_append(v_uninvited, v_parent);
    end if;
  end loop;

  return jsonb_build_object(
    'id', v_id,
    'number', v_number,
    'uninvited_parents', to_jsonb(v_uninvited)
  );
end;
$$;
