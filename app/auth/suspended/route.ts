import { redirect } from "next/navigation";

import { SUSPENDED_JOIN_HREF } from "@/lib/sign-in-links";
import { createClient } from "@/lib/supabase/server";

/**
 * A suspended account's way out (Step 103.4): `getProfile` sends it here
 * the moment it's suspended, since a page can't clear cookies. Signing out
 * drops this browser's session (Supabase Auth answers a banned account's
 * sign-out with 403, which auth-js takes as signed out); /join then says
 * the account is suspended. Redirected relatively, so a `*.localhost`
 * host in dev keeps its own cookies.
 */
export async function GET() {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect(SUSPENDED_JOIN_HREF);
}
