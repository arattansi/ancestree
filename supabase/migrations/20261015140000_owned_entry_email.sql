-- Step 156 (1 of 2) — An entry's email, read only by its owner.
--
-- Step 155 left one gap: `people_select` lets any member of a tree showing
-- an entry in full read its row, and row security is per row, so
-- `/rest/v1/people?select=email` handed them the address even when its
-- owner left "Show this email to other members of the tree"
-- (`email_visible`) off. `person_claim_candidates` did the same: its
-- full-card rows are the whole `people` row.
--
-- This half is additive, applied before the app that uses it:
--
--   owned_entry_email   the email on an entry the caller owns; null for
--                       anyone else's. The two places the app read an
--                       owner's email straight from `people` (the account
--                       page's own entry, a parent's own child off the
--                       tree) ask this instead.
--   person_claim_candidates
--                       a full card's email only as `tree_people` shows
--                       it: the owner's own, or one shown to members.
--                       Nothing reads it there; the rest is unchanged.
--
-- 20261015141000 then stops `authenticated` reading `people.email` at all,
-- once the deployed app no longer asks for it.
--
-- Down: drop `public.owned_entry_email`, re-create
-- `person_claim_candidates` from 20260929120000.

create or replace function public.owned_entry_email(p_person uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select pe.email
  from public.people pe
  where pe.id = p_person
    and pe.owner_user_id = (select auth.uid());
$$;

comment on function public.owned_entry_email(uuid) is
  'Step 156: the email on an entry the caller owns; null otherwise. Members read others'' emails only through tree_people.';

revoke all on function public.owned_entry_email(uuid) from public, anon;
grant execute on function public.owned_entry_email(uuid) to authenticated, service_role;

-- As 20260929120000_carried_line_gaps, with a full card's email masked.
create or replace function public.person_claim_candidates()
returns setof public.people
language sql
security definer
set search_path = ''
as $$
  with me as (
    select self.*
    from public.profiles p
    join public.people self on self.id = p.self_person_id
    where p.auth_user_id = (select auth.uid())
      -- Claiming merges this entry away, so only a placeholder is offered
      -- anything (Step 36), as `claim_person` requires.
      and private.is_own_placeholder(self.id, (select auth.uid()))
  ),
  unclaimed as (
    select pe.id, bool_or(pl.detail = 'full') as in_full
    from public.people pe
    join public.tree_placements pl
      on pl.person_id = pe.id and pl.status = 'active'
    join public.tree_members m on m.tree_id = pl.tree_id and m.user_id = (select auth.uid())
    cross join me
    where pe.id <> me.id
      and private.is_placed(pl.tree_id, me.id)
      and pe.owner_user_id = pe.created_by
      -- Nobody is someone who has died (Step 36).
      and pe.is_deceased is not true
      and pe.date_of_death is null
      and not exists (select 1 from public.profiles p where p.self_person_id = pe.id)
      and not exists (
        select 1 from public.claims c where c.person_id = pe.id and c.status = 'approved'
      )
      and not exists (
        select 1 from public.claims c
        where c.person_id = pe.id and c.claimant_user_id = (select auth.uid()) and c.status = 'disputed'
      )
    group by pe.id
  )
  select (
    case
      -- Its email only as `tree_people` shows it (Step 156): to the
      -- owner, or when it's shown to the members of its trees.
      when u.in_full then jsonb_populate_record(
        pe,
        jsonb_build_object(
          'email',
          case
            when pe.owner_user_id = (select auth.uid()) or pe.email_visible
              then pe.email
          end
        )
      )
      else jsonb_populate_record(
        null::public.people,
        jsonb_build_object(
          'id', pe.id,
          'tree_id', pe.tree_id,
          'first_name', pe.first_name,
          'preferred_name', pe.preferred_name,
          'last_name', pe.last_name,
          'city_of_birth', pe.city_of_birth,
          'country_of_birth', pe.country_of_birth,
          'place_id_birth', pe.place_id_birth,
          'is_deceased', false
        )
      )
    end
  ).*
  from unclaimed u
  join public.people pe on pe.id = u.id
  cross join me
  where
    (
      lower(btrim(pe.last_name)) = lower(btrim(me.last_name))
      and (
        (nullif(btrim(me.first_name), '') is not null
         and lower(btrim(me.first_name)) in (
           lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
        or
        (nullif(btrim(me.preferred_name), '') is not null
         and lower(btrim(me.preferred_name)) in (
           lower(btrim(coalesce(pe.first_name, ''))), lower(btrim(coalesce(pe.preferred_name, '')))))
      )
    )
    or private.person_invited_to_claim(pe.id);
$$;
