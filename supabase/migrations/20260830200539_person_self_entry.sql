-- First-run onboarding: atomically create a member's own person entry and
-- point profiles.self_person_id at it. SECURITY DEFINER so the insert + the
-- profile update land together; RLS-equivalent checks are enforced inline.

create or replace function public.create_self_person(
  p_given_name text,
  p_preferred_name text,
  p_family_name text,
  p_country_of_birth text,
  p_is_deceased boolean,
  p_date_of_birth date default null,
  p_city_of_birth text default null,
  p_photo_path text default null,
  p_date_of_death date default null,
  p_place_of_death text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_existing uuid;
  v_has_profile boolean;
  v_tree uuid;
  v_person uuid;
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select true, self_person_id
    into v_has_profile, v_existing
  from public.profiles
  where auth_user_id = v_uid;

  if v_has_profile is not true then
    raise exception 'No member profile' using errcode = '42501';
  end if;
  if v_existing is not null then
    raise exception 'Your own entry already exists' using errcode = 'unique_violation';
  end if;

  select id into v_tree
  from public.trees
  order by created_at asc
  limit 1;

  if v_tree is null then
    raise exception 'No family tree exists yet';
  end if;

  insert into public.people (
    tree_id, given_name, preferred_name, family_name,
    date_of_birth, city_of_birth, country_of_birth, photo_path,
    is_deceased, date_of_death, place_of_death,
    created_by, owner_user_id
  ) values (
    v_tree,
    nullif(btrim(p_given_name), ''),
    nullif(btrim(p_preferred_name), ''),
    btrim(p_family_name),
    p_date_of_birth,
    nullif(btrim(p_city_of_birth), ''),
    btrim(p_country_of_birth),
    nullif(btrim(p_photo_path), ''),
    coalesce(p_is_deceased, false),
    case when coalesce(p_is_deceased, false) then p_date_of_death end,
    case when coalesce(p_is_deceased, false) then nullif(btrim(p_place_of_death), '') end,
    v_uid,
    v_uid
  )
  returning id into v_person;

  update public.profiles
     set self_person_id = v_person
   where auth_user_id = v_uid;

  return v_person;
end;
$$;

revoke all on function public.create_self_person(
  text, text, text, text, boolean, date, text, text, date, text
) from anon, public;

grant execute on function public.create_self_person(
  text, text, text, text, boolean, date, text, text, date, text
) to authenticated, service_role;
