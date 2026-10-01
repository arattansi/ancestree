import { timingSafeEqual } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { sendWeeklyNewsletters } from "@/lib/newsletter.server";

/** A run reads every tree and sends in batches: allow it the full five minutes. */
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The request carries `Authorization: Bearer <CRON_SECRET>`, as Vercel Cron sends it. */
function fromTheJob(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/**
 * `GET /api/cron/newsletter`: the weekly newsletter (Step 95), called by
 * Vercel Cron on Sunday (`vercel.json`) and by nobody else — without the
 * job's secret it answers 401 and does nothing. `?user=<id>` (repeatable)
 * narrows a run to some members, for a test send with the same secret.
 * Answers with counts only.
 */
export async function GET(request: NextRequest) {
  if (!fromTheJob(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  // A test send names its members; a malformed one is refused rather than
  // read as "everyone".
  const users = request.nextUrl.searchParams.getAll("user");
  if (users.some((u) => !UUID.test(u))) {
    return NextResponse.json({ error: "Not a member id." }, { status: 400 });
  }
  try {
    const run = await sendWeeklyNewsletters({
      users: users.length ? users : undefined,
    });
    return NextResponse.json(run, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[newsletter] the run failed", err);
    return NextResponse.json({ error: "The run failed." }, { status: 500 });
  }
}
