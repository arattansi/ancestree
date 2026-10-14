import { NextResponse, type NextRequest } from "next/server";

import { setGettingStartedByToken } from "@/lib/onboarding-settings.server";
import { gettingStartedPageHref } from "@/lib/tree-links";

/**
 * `POST /api/getting-started/<token>`: a mail app's one-click unsubscribe
 * from the getting started emails (Step 151; RFC 8058, the email's
 * `List-Unsubscribe-Post` header). Turns them off at once; answers the
 * same whether or not the token was one.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/getting-started/[token]">) {
  const { token } = await ctx.params;
  await setGettingStartedByToken(token, false);
  return new NextResponse(null, { status: 200 });
}

/**
 * Opened rather than posted (a mail app that only links): the page, whose
 * button does it. Never on a GET, which mail scanners send.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/getting-started/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(gettingStartedPageHref(token), request.url), 303);
}
