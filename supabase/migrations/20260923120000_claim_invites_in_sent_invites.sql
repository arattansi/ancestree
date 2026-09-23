-- Step 38: invites to claim an entry show in "Sent invites".
--
-- An invite to claim an entry, sent from the entry's card or from the
-- add-relative form's email box (`sendClaimInvite`), never got the record
-- every other emailed invite keeps in `invite_requests` (source 'direct',
-- already approved), and the admin console's "Sent invites" is read from
-- those records. So none of them showed there; with no record, the console
-- listed them under "Bare links" instead, with no name or address. The app
-- now writes the record as it sends one. This adds it for the invites
-- already out, live or archived: named after the entry as its card shows it
-- (`private.person_label`'s halves: the preferred name, else the first
-- name, then the last name, which `people` never leaves blank), attributed
-- to whoever sent it and dated when they did. Whether their email went out
-- wasn't kept, so `email_sent` stays null (unknown).
--
-- Data only. It adds a record for an invite that names an entry and went to
-- an address, and has none; nothing else is touched. `redeem_invite`
-- already deletes an invite's record with the invite.

insert into public.invite_requests (
  tree_id,
  first_name,
  last_name,
  email,
  source,
  status,
  reviewed_by,
  reviewed_at,
  invite_id,
  created_at
)
select
  i.tree_id,
  coalesce(nullif(btrim(p.preferred_name), ''), btrim(p.first_name)),
  btrim(p.last_name),
  i.invited_email,
  'direct',
  'approved',
  i.created_by,
  i.created_at,
  i.id,
  i.created_at
from public.invites i
join public.people p on p.id = i.person_id
where i.invited_email is not null
  and not exists (
    select 1 from public.invite_requests r where r.invite_id = i.id
  );
