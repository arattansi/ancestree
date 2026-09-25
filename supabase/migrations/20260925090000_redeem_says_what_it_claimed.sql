-- Step 50 — A welcome after accepting a claim invite
--
-- Accepting a claim invite opened the canvas on the entry it named, with
-- nothing to say who had added them or that the entry could use a photo.
-- Now it lands on a welcome page first (`/welcome`): a newcomer the invite
-- made the entry's owner is asked for a photo and what's missing, and a
-- member who brought their own entry is greeted to the tree.
--
-- `redeem_invite_tree` says what the app needs to tell those apart, as they
-- stood before the invite was redeemed (it's deleted once it is):
-- * `claim_invite` — the invite named an entry to claim;
-- * `had_entry` — they had an entry of their own already, so a claim invite
--   folded its entry into theirs or put theirs beside it (Step 41.3), rather
--   than making its entry theirs (Step 30.2);
-- * `was_member` — they were on the invite's tree already.
-- Nothing else changes: `redeem_invite` is called exactly as before.

create or replace function public.redeem_invite_tree(p_token text, p_display_name text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_claim_invite boolean := false;
  v_had_entry boolean := false;
  v_was_member boolean := false;
  v_profile public.profiles;
  v_tree public.trees;
begin
  -- As things stood before redeeming. An invite that isn't live is refused
  -- by `redeem_invite` below, whatever is read here.
  select i.person_id is not null,
         exists (
           select 1 from public.tree_members m
           where m.tree_id = i.tree_id and m.user_id = v_uid
         )
  into v_claim_invite, v_was_member
  from public.invites i
  where i.token = p_token;

  select p.self_person_id is not null into v_had_entry
  from public.profiles p
  where p.auth_user_id = v_uid;

  v_profile := public.redeem_invite(p_token, p_display_name);
  select * into v_tree from public.trees
  where id = nullif(current_setting('ancestree.redeemed_tree', true), '')::uuid;
  return jsonb_build_object(
    'tree_id', v_tree.id, 'tree_slug', v_tree.slug, 'tree_name', v_tree.name,
    'self_person_id', v_profile.self_person_id,
    -- Claimed on the way in (Step 30.2), or there already: the app opens the
    -- canvas on it rather than onboarding.
    'self_placed', private.is_placed(v_tree.id, v_profile.self_person_id),
    -- Which welcome, if any (Step 50).
    'claim_invite', coalesce(v_claim_invite, false),
    'had_entry', coalesce(v_had_entry, false),
    'was_member', coalesce(v_was_member, false)
  );
end;
$$;

revoke all on function public.redeem_invite_tree(text, text) from anon, public;
grant execute on function public.redeem_invite_tree(text, text) to authenticated, service_role;
