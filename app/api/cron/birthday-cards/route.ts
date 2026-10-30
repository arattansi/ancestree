import { NextResponse, type NextRequest } from "next/server";

import { fromTheJob } from "@/lib/cron.server";
import { sendEmails } from "@/lib/email";
import { birthdayCardEmail } from "@/lib/emails/birthday-card";
import { reachableEmail } from "@/lib/no-email";
import { getSiteUrl } from "@/lib/site-url";
import { createAdminClient } from "@/lib/supabase/admin";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * `GET /api/cron/birthday-cards`: birthday cards' word (Step 217). Vercel
 * Cron calls it every three hours (`vercel.json`; on the Hobby plan each
 * entry runs once a day, so there are eight), and nobody else — without the
 * job's secret it answers 401 and does nothing.
 *
 * Each run: managers of a birthday 14 days off with no card yet are nudged,
 * from 8 in their morning (`send_card_nudges`), and the person whose card
 * opened at midnight is told, from 8 in theirs, in the app and by email
 * (`announce_birthday_cards`). The card itself opens at midnight whatever
 * this does: the database reads the clock. Answers with counts only.
 */
export async function GET(request: NextRequest) {
  if (!fromTheJob(request)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  try {
    const admin = createAdminClient();
    const nudged = await admin.rpc("send_card_nudges");
    if (nudged.error) throw nudged.error;
    const told = await admin.rpc("announce_birthday_cards");
    if (told.error) throw told.error;

    const url = `${getSiteUrl()}/family`;
    const emails = (told.data ?? []).flatMap((r) => {
      const to = reachableEmail(r.email);
      return to
        ? [{ to, ...birthdayCardEmail({ firstName: r.first_name ?? "", signatures: r.signatures ?? 0, url }) }]
        : [];
    });
    const sent = await sendEmails(emails);
    return NextResponse.json(
      {
        nudged: nudged.data?.length ?? 0,
        told: told.data?.length ?? 0,
        emailed: sent.filter((s) => s.ok).length,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[cards] the run failed", err);
    return NextResponse.json({ error: "The run failed." }, { status: 500 });
  }
}
