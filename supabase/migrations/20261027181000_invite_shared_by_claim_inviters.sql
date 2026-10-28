-- A link to claim an entry is handed back to whoever may make one for it
-- (`mintClaimLink` returns a live one rather than a second), so its share
-- counts from them too: a Leaf sending the link a Root made for someone
-- they added (Step 216). Body as in 20261027180000_invite_events, with
-- only that allowance added.
create or replace function public.note_invite_shared(p_token text, p_channel text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invite public.invites;
begin
  if p_channel is null or p_channel not in ('share', 'whatsapp', 'messages', 'copy') then
    raise exception 'INVITE_CHANNEL: not a share button' using errcode = '22023';
  end if;

  select * into v_invite from public.invites i where i.token = p_token;
  if not found or v_invite.founds_tree then
    return;
  end if;
  if v_invite.created_by is distinct from (select auth.uid())
     and not private.is_root_of(v_invite.tree_id)
     and not (
       private.invite_link(v_invite) = 'claim'
       and coalesce(private.can_invite_to_claim_on(v_invite.tree_id, v_invite.person_id), false)
     ) then
    raise exception 'NOT_YOURS: only its sender or a Root shares an invite'
      using errcode = '42501';
  end if;

  insert into private.invite_events (invite_id, tree_id, kind, link, channel)
  values (v_invite.id, v_invite.tree_id, 'shared', private.invite_link(v_invite), p_channel);
end;
$$;
