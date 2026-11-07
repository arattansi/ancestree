-- Step 223: the weekly newsletter names the birthday cards each reader could
-- sign and hasn't, at the top (Aalim, 2026-11-07: "add that 'birthday cards
-- to sign' line at the top of the newsletter").
--
-- `newsletter_cards_to_sign`: for each of `p_users`, every card still open
-- for signing (`now() < closes_at`, the end of the birthday where it opens)
-- of someone living, among whose relatives they are reminded to sign
-- (`private.card_reminder_members`, the same people a started card tells in
-- the app: members whose My Family Tree shows the person), that they
-- haven't signed, signed in or through their own personal link. The person
-- themself is never in that set, so nobody hears of their own card before
-- the day. Service role only, as `newsletter_unread_messages` is.

create or replace function public.newsletter_cards_to_sign(p_users uuid[])
returns table (
  user_id uuid,
  card_id uuid,
  person_id uuid,
  first_name text,
  opens_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.u, c.id, c.person_id, private.card_first_name(c.person_id), c.opens_on
  from public.birthday_cards c
  join public.people p on p.id = c.person_id
  cross join lateral private.card_reminder_members(c.person_id) as r(u)
  where now() < c.closes_at
    and not p.is_deceased and p.date_of_death is null
    and r.u = any(p_users)
    and not exists (
      select 1
      from public.card_signatures s
      left join public.profiles pr on pr.auth_user_id = r.u
      where s.card_id = c.id
        and (
          s.signer_user_id = r.u
          or (pr.self_person_id is not null and s.signer_person_id = pr.self_person_id)
        )
    )
  order by r.u, c.opens_on, c.id;
$$;

revoke all on function public.newsletter_cards_to_sign(uuid[]) from public, anon, authenticated;
grant execute on function public.newsletter_cards_to_sign(uuid[]) to service_role;
