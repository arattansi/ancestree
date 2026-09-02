-- Admin: remove a member.
--
-- Deleting a profile is already allowed by RLS (profiles_delete → is_admin),
-- but ON DELETE RESTRICT foreign keys on people / relationships / comments /
-- documents / invites / share_links / trees block it for any member who has
-- ever created content. This RPC reassigns everything the departing member
-- created or owns to the acting admin, then deletes their profile. The auth
-- user itself is removed by the server action via the service role.

create or replace function public.admin_delete_member(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid := (select auth.uid());
  v_target public.profiles;
begin
  if v_admin is null or not private.is_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  if p_user_id = v_admin then
    raise exception 'cannot delete yourself' using errcode = '22023';
  end if;

  select * into v_target from public.profiles where auth_user_id = p_user_id;
  if not found then
    raise exception 'member not found' using errcode = 'P0002';
  end if;

  if v_target.role = 'admin' then
    raise exception 'cannot delete another admin' using errcode = '22023';
  end if;

  -- Reassign to the acting admin so RESTRICT foreign keys don't block removal.
  update public.people set created_by = v_admin where created_by = p_user_id;
  update public.people set owner_user_id = v_admin where owner_user_id = p_user_id;
  update public.relationships set created_by = v_admin where created_by = p_user_id;
  update public.entry_comments set created_by = v_admin where created_by = p_user_id;
  update public.documents set uploaded_by = v_admin where uploaded_by = p_user_id;
  update public.invites set created_by = v_admin where created_by = p_user_id;
  update public.share_links set created_by = v_admin where created_by = p_user_id;
  update public.trees set created_by = v_admin where created_by = p_user_id;
  update public.tree_bridges set created_by = v_admin where created_by = p_user_id;

  -- Everything else pointing at this member is ON DELETE CASCADE (their claims,
  -- notifications, canvas-interest rows) or SET NULL (invited_by, reviewed_by).
  delete from public.profiles where auth_user_id = p_user_id;
end;
$$;

revoke all on function public.admin_delete_member(uuid) from public, anon;
grant execute on function public.admin_delete_member(uuid) to authenticated;
