import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";

import { openConsole } from "@/lib/open-console.server";

/**
 * `GET /account/admin?tree=<id>&section=<card>`: the button in an alert
 * email (Step 30.1), built by `openConsoleHref`. Opens the admin console
 * of the tree the alert is about, at the card that's waiting — a Root of
 * several trees would otherwise land on whichever tree they last looked
 * at. All it does is switch the tree the browser is looking at, which
 * spends nothing, so a mail scanner opening the link does no harm (Step
 * 20). Signed out, proxy.ts sends them to sign in, and signing in opens
 * the console the same way (`signInLanding`).
 */
export async function GET(request: NextRequest) {
  // A relative redirect keeps the host the link was opened on; the
  // request's own origin can name another (`next dev` says localhost).
  redirect(await openConsole(request.nextUrl.searchParams));
}
