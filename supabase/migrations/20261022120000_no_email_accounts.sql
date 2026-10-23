-- Step 202.1: accounts with no email.
--
-- Family who use WeChat, not email, join from a claim link or the family
-- link with their name alone (Step 202.2) and get back in through a sign-in
-- link a Root sends them (Step 202.3). Their account still needs an address
-- to hold a session, so it gets one at no-email.ancestree.space, a domain
-- with no mail server (`lib/no-email.ts` makes them). Nothing is ever sent
-- to it: the app drops it from every sender. Here it's kept off their own
-- entry, and off a Root.

-- Whether an address is one of those, not a real inbox.
create or replace function private.is_no_email(p_email text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select lower(btrim(coalesce(p_email, ''))) like '%@no-email.ancestree.space';
$$;

-- An account's address is copied onto its own entry when that has none
-- (Step 41.4). Not one with no email: it would show on their card as an
-- address to write to. Otherwise as `20261001170000`.
CREATE OR REPLACE FUNCTION private.seed_self_email()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if new.self_person_id is not null
     and (tg_op = 'INSERT' or old.self_person_id is distinct from new.self_person_id) then
    update public.people pe
    set email = lower(u.email)
    from auth.users u
    where pe.id = new.self_person_id
      and pe.email is null
      and pe.placeholder_number is null
      and u.id = new.auth_user_id
      and u.email is not null
      and not private.is_no_email(u.email);
  end if;
  return new;
end;
$function$;

-- A Root needs an email (Step 202's decision 4): a Root sends sign-in links
-- for the members with none and gets the tree's requests by email. However
-- they'd become one — founding a tree, a founder invite or campaign link,
-- being made one, or handed the tree by a departing Root — this stops it.
-- After tree_members_guard and tree_members_limits (name order).
create or replace function private.tree_members_no_email_root()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'admin'
     and (tg_op = 'INSERT' or old.role is distinct from 'admin')
     and exists (
       select 1 from auth.users u
       where u.id = new.user_id and private.is_no_email(u.email)
     ) then
    raise exception 'NO_EMAIL_ROOT: a Root needs an email address'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger tree_members_no_email_root
  before insert or update of role on public.tree_members
  for each row execute function private.tree_members_no_email_root();
