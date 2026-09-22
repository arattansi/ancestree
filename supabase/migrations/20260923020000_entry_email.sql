-- Email on the entry. A person's email lives on their node, private by
-- default: other members see it only when `email_visible` is on, and the
-- tree view withholds it otherwise. A member's own entry is seeded with the
-- address they sign in with, now and whenever an entry becomes theirs.

alter table public.people
  add column if not exists email text,
  add column if not exists email_visible boolean not null default false;

alter table public.people drop constraint if exists people_email_shape;
alter table public.people
  add constraint people_email_shape
  check (email is null or (length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'));

-- Existing members: their own entry gets their sign-in address.
update public.people pe
set email = lower(u.email)
from public.profiles pr
join auth.users u on u.id = pr.auth_user_id
where pr.self_person_id = pe.id
  and pe.email is null
  and u.email is not null;

-- From now on: when an entry becomes a member's own (claimed, added at
-- onboarding, or bound by a Root), seed it the same way if it has none.
create or replace function private.seed_self_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.self_person_id is not null
     and (tg_op = 'INSERT' or old.self_person_id is distinct from new.self_person_id) then
    update public.people pe
    set email = lower(u.email)
    from auth.users u
    where pe.id = new.self_person_id
      and pe.email is null
      and u.id = new.auth_user_id
      and u.email is not null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_seed_self_email on public.profiles;
create trigger profiles_seed_self_email
after insert or update of self_person_id on public.profiles
for each row execute function private.seed_self_email();

-- The tree view gains the two columns; the address only for those it's for.
create or replace view public.tree_people
with (security_invoker = true) as
select
  pl.tree_id,
  pl.id as placement_id,
  pl.status as placement_status,
  pl.pos_x,
  pl.pos_y,
  pl.pos_dx,
  pl.pos_dy,
  (pe.tree_id = pl.tree_id) as is_home,
  pl.person_id as id,
  pe.tree_id as home_tree_id,
  pe.first_name,
  pe.middle_name,
  pe.preferred_name,
  pe.maiden_name,
  pe.last_name,
  pe.date_of_birth,
  pe.date_of_death,
  pe.date_of_birth_precision,
  pe.date_of_death_precision,
  pe.city_of_birth,
  pe.country_of_birth,
  pe.place_id_birth,
  pe.place_id_death,
  pe.is_deceased,
  pe.place_of_death,
  pe.sex,
  pe.lineage_type,
  pe.photo_path,
  pe.photo_crop,
  pe.owner_user_id,
  pe.created_by,
  pe.verified_at,
  pe.hidden_from_visitors,
  pe.created_at,
  pe.updated_at,
  (pe.id is null) as blurred,
  -- Shown to other members only when the person says so; whoever may edit
  -- the entry always sees it.
  case
    when pe.id is not null and (pe.email_visible or private.can_edit_person(pe.id)) then pe.email
  end as email,
  pe.email_visible
from public.tree_placements pl
left join public.people pe on pe.id = pl.person_id
where pl.status = 'active';

grant select on public.tree_people to authenticated, service_role;
