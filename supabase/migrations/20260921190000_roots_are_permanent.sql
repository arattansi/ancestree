-- Step 22.5: a Root can make another member a Root from /admin, but a Root is
-- never demoted or removed — not by another Root, not by themselves.
--
-- Promoting needs nothing new: `profiles_protect_role` already lets a Root
-- set any role. What's new is the other direction, held here rather than
-- only in the UI: a Root's role can't be changed, and a Root's profile row
-- can't be deleted through RLS. (`admin_delete_member` already refuses a
-- Root.) The privileged bootstrap path keeps its bypass.

create or replace function private.profiles_protect_role()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if coalesce(current_setting('ancestree.privileged_profile_write', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if not private.is_admin() then
      new.role := 'member';
    end if;
  elsif tg_op = 'UPDATE' then
    if not private.is_admin() then
      new.role := old.role;
    elsif old.role = 'admin' and new.role is distinct from 'admin' then
      raise exception 'ROOT_IS_PERMANENT: a Root stays a Root'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$function$;

drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles
  for delete to authenticated
  using ((select private.is_admin()) and role <> 'admin');
