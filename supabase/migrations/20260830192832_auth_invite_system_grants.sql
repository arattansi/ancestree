-- Step 3 — Auth & invite system: tighten EXECUTE grants.
-- Only invite_preview should be reachable pre-auth; the rest are authenticated-only.

revoke execute on function public.ensure_profile(text) from public, anon;
revoke execute on function public.redeem_invite(text, text) from public, anon;
revoke execute on function public.invite_preview(text) from public;

grant execute on function public.invite_preview(text) to anon, authenticated;
grant execute on function public.ensure_profile(text) to authenticated;
grant execute on function public.redeem_invite(text, text) to authenticated;
