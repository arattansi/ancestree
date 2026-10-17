-- Step 174.6, after review — Messages end to end, hardened
--
-- An independent review of `20261016160000_messages_end_to_end` and its
-- client found nothing that lets this database read a message, but three
-- things for here:
--
-- 1. Text is now padded to 256-byte steps before it's encrypted, so a
--    message's length shows only roughly. The size check follows: a
--    multiple of 256 plus the 16-byte tag, at most 16,128 + 16 (4,000
--    characters are at most 16,000 bytes, padded up).
-- 2. Expired device links went only when the same member made another, so
--    an old encrypted keyring could sit here; now every expired one, any
--    member's, goes whenever a link is made or taken.
-- 3. `put_key_backup` checked the key version without holding the member's
--    row, so it could race a reset (`publish_messaging_key`, which does) and
--    leave a backup of the old key; it holds the row now.
--
-- No message was ever stored outside throwaway tests, which are gone, so
-- the new size check meets no old rows; the migration refuses if any exist.

do $guard$
begin
  if exists (select 1 from public.messages) then
    raise exception 'messages exist: check them against the padded size first';
  end if;
end
$guard$;

-- ---------------------------------------------------------------------------
-- 1. Padded ciphertext
-- ---------------------------------------------------------------------------

alter table public.messages drop constraint messages_ciphertext_check;
alter table public.messages add constraint messages_ciphertext_check
  check (
    octet_length(ciphertext) between 272 and 16144
    and (octet_length(ciphertext) - 16) % 256 = 0
  );

-- ---------------------------------------------------------------------------
-- 2. Expired links go, anyone's
-- ---------------------------------------------------------------------------

create index messaging_key_transfers_created_at_idx
  on public.messaging_key_transfers (created_at);

create or replace function public.put_key_transfer(p_id uuid, p_blob text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  delete from public.messaging_key_transfers t
  where t.created_at < now() - interval '10 minutes';
  if (select count(*) from public.messaging_key_transfers t where t.user_id = v_me) >= 3 then
    raise exception 'SLOW_DOWN' using errcode = '54000';
  end if;
  begin
    insert into public.messaging_key_transfers (id, user_id, blob)
    values (p_id, v_me, private.unb64(p_blob));
  exception when check_violation or not_null_violation or unique_violation then
    raise exception 'BAD_TRANSFER' using errcode = '22023';
  end;
end;
$$;

create or replace function public.take_key_transfer(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_blob bytea;
begin
  delete from public.messaging_key_transfers t
  where t.id = p_id
    and t.user_id = (select auth.uid())
    and t.created_at >= now() - interval '10 minutes'
  returning t.blob into v_blob;
  delete from public.messaging_key_transfers t
  where t.created_at < now() - interval '10 minutes';
  if v_blob is null then
    raise exception 'LINK_EXPIRED' using errcode = '22023';
  end if;
  return private.b64(v_blob);
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. A backup can't race a reset
-- ---------------------------------------------------------------------------

create or replace function public.put_key_backup(p_blob text, p_key_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := (select auth.uid());
begin
  if v_me is null then
    raise exception 'NOT_SIGNED_IN' using errcode = '42501';
  end if;
  -- The same row `publish_messaging_key` holds while it resets.
  perform 1 from public.profiles p where p.auth_user_id = v_me for update;
  if p_key_version is distinct from (
    select max(k.version) from public.messaging_keys k where k.user_id = v_me
  ) then
    raise exception 'KEYS_CHANGED' using errcode = '40001';
  end if;
  begin
    insert into public.messaging_key_backups (user_id, key_version, blob)
    values (v_me, p_key_version, private.unb64(p_blob))
    on conflict (user_id) do update
      set key_version = excluded.key_version, blob = excluded.blob, updated_at = now();
  exception when check_violation or not_null_violation then
    raise exception 'BAD_BACKUP' using errcode = '22023';
  end;
end;
$$;
