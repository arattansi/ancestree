-- Step 88.2, after the deploy: flags leave the comments board and disputes
-- leave the claims, now that the app raises both as reports
-- (20260929160000_entry_reports). Applied once the new app is live, since
-- the old one reads what this drops.

-- 1. A flag raised on the old board in the meantime moves across as the
-- report it was.
insert into public.entry_reports
  (person_id, tree_id, created_by, body, status,
   created_at, updated_at, resolved_at, resolved_by)
select person_id, tree_id, created_by, left(btrim(body), 1000), status,
  created_at, updated_at,
  case when status = 'resolved' then coalesce(resolved_at, updated_at) end,
  case when status = 'resolved' then resolved_by end
from public.entry_comments
where is_flag;

delete from public.entry_comments where is_flag;

-- 2. A claim still marked disputed stands again, with its dispute open.
insert into public.entry_reports
  (person_id, tree_id, claim_id, created_by, body, created_at)
select c.person_id, pe.tree_id, c.id, pe.created_by,
  coalesce(left(nullif(btrim(c.dispute_reason), ''), 1000), 'No reason given.'),
  c.updated_at
from public.claims c
join public.people pe on pe.id = c.person_id
where c.status = 'disputed';

update public.claims set status = 'approved' where status = 'disputed';

-- 3. An old dispute's reason, decided long ago, is kept as the resolved
-- report it was: only its disputer and the Roots see it now.
insert into public.entry_reports
  (person_id, tree_id, claim_id, created_by, body, status,
   created_at, resolved_at, resolved_by)
select c.person_id, pe.tree_id, c.id, pe.created_by,
  left(btrim(c.dispute_reason), 1000), 'resolved',
  c.updated_at, coalesce(c.resolved_at, c.updated_at), c.resolved_by
from public.claims c
join public.people pe on pe.id = c.person_id
where nullif(btrim(c.dispute_reason), '') is not null
  and not exists (
    select 1 from public.entry_reports r where r.claim_id = c.id
  );

alter table public.claims drop column dispute_reason;

drop function public.dispute_claim(uuid, text);
drop function public.resolve_claim(uuid, text);
drop function public.resolve_entry_flag(uuid, boolean);

-- 4. The board is comments only: a new one tells the entry's owner and
-- whoever added it, as before.
create or replace function private.entry_comment_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner uuid;
  v_creator uuid;
  v_actor uuid := (select auth.uid());
  v_body text;
begin
  select owner_user_id, created_by into v_owner, v_creator
  from public.people where id = new.person_id;
  v_body := private.person_label(new.person_id) || ' has a new comment: '
    || left(btrim(new.body), 140);

  perform private.notify(
    v_owner, v_actor, 'entry_commented', new.person_id, null, v_body, new.tree_id
  );
  if v_creator is distinct from v_owner then
    perform private.notify(
      v_creator, v_actor, 'entry_commented', new.person_id, null, v_body, new.tree_id
    );
  end if;
  return new;
end;
$$;

drop trigger entry_comments_notify on public.entry_comments;
create trigger entry_comments_notify
  after insert on public.entry_comments
  for each row execute function private.entry_comment_notify();

alter table public.entry_comments
  drop column is_flag,
  drop column status,
  drop column resolved_at,
  drop column resolved_by;
