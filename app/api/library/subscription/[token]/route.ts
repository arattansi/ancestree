import { NextResponse } from "next/server";

import { blogSubscriptionHref } from "@/lib/blog";
import { unsubscribe } from "@/lib/library-subscribers.server";

/**
 * One-click unsubscribe (RFC 8058) for the library's emails (Step 135): a
 * mail app posts here from its own Unsubscribe button. Always 200, so
 * nothing says whether the token was one. A GET (a scanner, a person)
 * only goes to the page, where the button is.
 */
export async function POST(_request: Request, context: RouteContext<"/api/library/subscription/[token]">) {
  const { token } = await context.params;
  await unsubscribe(token);
  return new NextResponse(null, { status: 200 });
}

export async function GET(request: Request, context: RouteContext<"/api/library/subscription/[token]">) {
  const { token } = await context.params;
  return NextResponse.redirect(new URL(blogSubscriptionHref(token), request.url), 303);
}
