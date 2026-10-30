import { NextResponse, type NextRequest } from "next/server";

import { fromTheJob } from "@/lib/cron.server";
import { sendEmails } from "@/lib/email";
import { birthdayCardEmail } from "@/lib/emails/birthday-card";
import { reachableEmail } from "@/lib/no-email";
import { cardReadyPush } from "@/lib/push";
import { sendPushes } from "@/lib/push.server";
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
 * (`announce_birthday_cards`), and on their phones (`card_ready_pushes`,
 * Step 217.4). Then a link signer's upload no signature
 * took for a day is removed (`take_stale_card_uploads`, Step 217.3). The
 * card itself opens at midnight whatever this does: the database reads the
 * clock. Answers with counts only.
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

    // Their phones, where the cards switch is on; a failure is logged only.
    const announced = (told.data ?? []).map((r) => r.card_id);
    let pushed = 0;
    if (announced.length > 0) {
      const ready = await admin.rpc("card_ready_pushes", { p_cards: announced });
      if (ready.error) console.error("[cards] couldn't claim the day's pushes", ready.error);
      ({ sent: pushed } = await sendPushes(
        (ready.data ?? []).map((r) => ({
          userId: r.user_id,
          note: cardReadyPush({ personId: r.person_id, firstName: r.first_name, signatures: r.signatures }),
        })),
      ));
    }

    // A file never signed with; a failure here waits for the next run.
    const stale = await admin.rpc("take_stale_card_uploads");
    const staleFiles = stale.error ? [] : (stale.data ?? []);
    if (staleFiles.length > 0) {
      const { error } = await admin.storage.from("cards").remove(staleFiles);
      if (error) console.error("[cards] couldn't remove stale uploads", error);
    }
    return NextResponse.json(
      {
        nudged: nudged.data?.length ?? 0,
        told: told.data?.length ?? 0,
        emailed: sent.filter((s) => s.ok).length,
        pushed,
        stale: staleFiles.length,
      },
      { headers: NO_STORE },
    );
  } catch (err) {
    console.error("[cards] the run failed", err);
    return NextResponse.json({ error: "The run failed." }, { status: 500 });
  }
}
