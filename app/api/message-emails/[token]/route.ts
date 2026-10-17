import { NextResponse, type NextRequest } from "next/server";

import { setMessageEmailsByToken } from "@/lib/message-waiting.server";
import { messageEmailsPageHref } from "@/lib/tree-links";

/**
 * `POST /api/message-emails/<token>`: a mail app's one-click unsubscribe
 * from the emails telling a member a message waits for them (Step 182; RFC
 * 8058, the email's `List-Unsubscribe-Post` header). Turns them off at
 * once; answers the same whether or not the token was one.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/message-emails/[token]">) {
  const { token } = await ctx.params;
  await setMessageEmailsByToken(token, false);
  return new NextResponse(null, { status: 200 });
}

/**
 * Opened rather than posted (a mail app that only links): the page, whose
 * button does it. Never on a GET, which mail scanners send.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/message-emails/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(messageEmailsPageHref(token), request.url), 303);
}
