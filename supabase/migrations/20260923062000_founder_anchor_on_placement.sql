-- Step 29 — A founder who brings their own entry onto the tree they founded
-- anchors it there.
--
-- A newcomer's tree is anchored on their entry when they add themselves
-- (`add_people_with_connections`, step 6), and a claim anchors it too. A
-- member who founds a tree already has an entry on another tree, so they
-- bring it over with `place_people` instead, which anchored nothing: their
-- tree had no bloodline gate and no anchor for the canvas to centre on.
-- Placing your own entry on the tree you founded now anchors it, once.

create or replace function public.place_people(p_tree uuid, p_person_ids uuid[])
returns table (placed_person_id uuid, placement_status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_person uuid;
  v_owner uuid;
  v_status text;
  v_tree_name text;
  v_founder uuid;
  v_self uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;
  if not private.is_root_of(p_tree) then
    raise exception 'Only a Root can bring people onto a tree' using errcode = '42501';
  end if;
  select name, created_by into v_tree_name, v_founder from public.trees where id = p_tree;
  select self_person_id into v_self from public.profiles where auth_user_id = v_uid;

  perform set_config('ancestree.privileged_profile_write', 'on', true);

  foreach v_person in array coalesce(p_person_ids, '{}') loop
    if not private.can_see_person(v_person) then
      raise exception 'You can only bring people you can see on a tree you belong to'
        using errcode = '42501';
    end if;

    v_owner := private.person_owner_member(v_person);
    v_status := case when v_owner is null or v_owner = v_uid then 'active' else 'pending' end;

    insert into public.tree_placements as tp (tree_id, person_id, status, placed_by, responded_at)
    values (p_tree, v_person, v_status, v_uid, case when v_status = 'active' then now() end)
    on conflict (tree_id, person_id) do update
      set status = case when tp.status = 'active' then 'active' else excluded.status end,
          placed_by = excluded.placed_by,
          responded_at = case when excluded.status = 'active' then now() end
    returning tp.status into v_status;

    -- The founder's own entry, on the tree they founded, is its anchor —
    -- as adding themselves would have made it.
    if v_status = 'active'
       and v_person = v_self
       and v_founder = v_uid
       and not private.bloodline_gate_active(p_tree) then
      insert into public.bloodline_anchors (tree_id, person_id, created_by)
      values (p_tree, v_person, v_uid)
      on conflict do nothing;
    end if;

    if v_status = 'pending' then
      perform private.notify(
        v_owner, v_uid, 'placement_requested', v_person, null,
        coalesce(private.member_label(v_uid), 'A Root')
          || ' would like to show your entry on ' || coalesce(v_tree_name, 'their tree')
          || '. Accept or decline from your account.',
        p_tree
      );
    end if;

    placed_person_id := v_person;
    placement_status := v_status;
    return next;
  end loop;

  perform set_config('ancestree.privileged_profile_write', '', true);
end;
$$;

revoke all on function public.place_people(uuid, uuid[]) from anon, public;
grant execute on function public.place_people(uuid, uuid[]) to authenticated, service_role;

-- Any founded tree already showing its founder's entry but never anchored.
insert into public.bloodline_anchors (tree_id, person_id, created_by)
select t.id, p.self_person_id, t.created_by
from public.trees t
join public.profiles p on p.auth_user_id = t.created_by
where p.self_person_id is not null
  and not exists (select 1 from public.bloodline_anchors a where a.tree_id = t.id)
  and exists (
    select 1 from public.tree_placements pl
    where pl.tree_id = t.id and pl.person_id = p.self_person_id and pl.status = 'active'
  );
