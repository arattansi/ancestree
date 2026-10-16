import { NextResponse, type NextRequest } from "next/server";

import { fromTheJob } from "@/lib/cron.server";
import { sendOnboardingEmails } from "@/lib/onboarding.server";

/** A run reads every tree and sends in batches: allow it the full five minutes. */
export const maxDuration = 300;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/cron/getting-started`: the getting started emails (Step 151)
 * on a weekday, which go at 3pm Pacific (Step 172). Vercel Cron calls it
 * Monday to Friday at 22:00 and 23:00 UTC (`vercel.json`: its clock is
 * UTC, so one of the two is 3pm Pacific on either side of daylight
 * saving) and nobody else — without the job's secret it answers 401 and
 * does nothing. Only the call at 3pm Pacific sends (`isDripHour`); the
 * other answers `held`. A weekend's emails go with the newsletter's
 * morning call (`/api/cron/newsletter`), which also takes test sends and
 * dry runs. Answers with counts only.
 */
export async function GET(request: NextRequest) {
  if (!fromTheJob(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    const drip = await sendOnboardingEmails();
    return NextResponse.json({ drip }, { headers: NO_STORE });
  } catch (err) {
    console.error("[onboarding] the run failed", err);
    return NextResponse.json({ error: "The run failed." }, { status: 500 });
  }
}
