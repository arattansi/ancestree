import { NextResponse, type NextRequest } from "next/server";

import { setNewsletterByToken } from "@/lib/newsletter-settings.server";
import { newsletterPageHref } from "@/lib/tree-links";

/**
 * `POST /api/newsletter/<token>`: a mail app's one-click unsubscribe from
 * the weekly newsletter (Step 95; RFC 8058, the email's
 * `List-Unsubscribe-Post` header). Turns it off at once; answers the same
 * whether or not the token was one, so it says nothing about who has one.
 */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/newsletter/[token]">) {
  const { token } = await ctx.params;
  await setNewsletterByToken(token, false);
  return new NextResponse(null, { status: 200 });
}

/**
 * Opened rather than posted (a mail app that only links): the page, whose
 * button does it. Never on a GET, which mail scanners send.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/newsletter/[token]">) {
  const { token } = await ctx.params;
  return NextResponse.redirect(new URL(newsletterPageHref(token), request.url), 303);
}
