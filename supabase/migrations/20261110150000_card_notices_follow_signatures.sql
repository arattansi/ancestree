-- Step 230: a signature taken off takes its "signed" notice with it (Aalim,
-- 2026-11-10: "i got a notification that Karim Kanji signed Aly's birthday
-- card but i don't see it in app"). Karim signed through the card's link and
-- took it off 32 seconds later; the card_signed notice his signing sent the
-- card's managers stayed.
--
-- A signing's notice is made in the same transaction as its signature, so it
-- carries the signature's created_at (both default to now()), and that's how
-- it's found again. Triggers rather than the three calls that remove one
-- (`delete_card_signature`, `delete_card_signature_by_link`,
-- `delete_birthday_card`), so every way a signature goes is covered.
--
-- One notice a day a card: a manager told of one signature isn't told of the
-- next for a day. So when the one they were told of goes, they hear of the
-- first held back that's still on the card instead (unread); with none, the
-- notice goes.

-- A signature gone, its notice with it or handed to the next one.
create or replace function private.card_signature_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_person uuid;
  v_notice public.notifications;
  v_next public.card_signatures;
begin
  select c.person_id into v_person from public.birthday_cards c where c.id = old.card_id;
  if v_person is null then
    -- The whole card went: `card_gone` saw to its notices.
    return null;
  end if;

  for v_notice in
    select * from public.notifications n
    where n.type = 'card_signed'
      and n.person_id = v_person
      and n.created_at = old.created_at
  loop
    select * into v_next from public.card_signatures s
    where s.card_id = old.card_id
      and s.created_at > v_notice.created_at
      and s.created_at < v_notice.created_at + interval '1 day'
      and s.signer_user_id is distinct from v_notice.recipient_user_id
    order by s.created_at
    limit 1;

    if v_next.id is null then
      delete from public.notifications where id = v_notice.id;
    else
      update public.notifications
      set actor_user_id = v_next.signer_user_id,
          body = v_next.signer_name || ' signed ' || private.card_first_name(v_person) || '''s birthday card.',
          created_at = v_next.created_at,
          read_at = null
      where id = v_notice.id;
    end if;
  end loop;
  return null;
end;
$$;

-- A card deleted before its day: its "started" notice and its signatures'
-- "signed" ones go. Before the delete, while its signatures can be read.
create or replace function private.card_gone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
  where n.person_id = old.person_id
    and (
      (n.type = 'card_started' and n.created_at = old.created_at)
      or (n.type = 'card_signed' and n.created_at in (
        select s.created_at from public.card_signatures s where s.card_id = old.id
      ))
    );
  return old;
end;
$$;

create trigger card_signatures_notice_gone
  after delete on public.card_signatures
  for each row
  execute function private.card_signature_gone();

create trigger birthday_cards_notices_gone
  before delete on public.birthday_cards
  for each row
  execute function private.card_gone();

revoke all on function private.card_signature_gone() from public, anon, authenticated;
revoke all on function private.card_gone() from public, anon, authenticated;

-- The one left behind so far (Karim's, on Aly's card): nobody signed in the
-- day after it, so it simply goes.
delete from public.notifications n
where n.type = 'card_signed'
  and not exists (
    select 1 from public.card_signatures s
    join public.birthday_cards c on c.id = s.card_id
    where c.person_id = n.person_id and s.created_at = n.created_at
  );
