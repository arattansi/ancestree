import { NewsletterControls } from "@/components/dashboard/newsletter-controls";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser, requireProfile } from "@/lib/auth";
import { nextSendAt, type NewsletterSchedule } from "@/lib/newsletter";
import { ownNewsletter } from "@/lib/newsletter.server";
import { createClient } from "@/lib/supabase/server";
import { byJoined, listMyTrees } from "@/lib/tree-context";

/**
 * The weekly newsletter on the beta reviewers' dashboard (Step 95): when
 * it goes out, the controls, and the reviewer's own issue as the next send
 * would make it from what's there now. The schedule is read as the
 * reviewer, so anyone else gets nothing to show (`newsletter_schedule`'s
 * RLS); the preview is their own and nobody else's.
 */
export async function NewsletterCard() {
  const supabase = await createClient();
  const [profile, user, trees, { data: schedule }] = await Promise.all([
    requireProfile(),
    getSessionUser(),
    listMyTrees(),
    supabase.from("newsletter_schedule").select("weekday, paused").maybeSingle(),
  ]);
  if (!schedule || !user?.email) return null;

  const preview = await ownNewsletter({
    userId: profile.auth_user_id,
    email: user.email,
    selfPersonId: profile.self_person_id,
    treeIds: byJoined(trees).map((t) => t.id),
  });
  return (
    <NewsletterCardView
      schedule={schedule}
      nextAt={nextSendAt(schedule, new Date())?.toISOString() ?? null}
      previewHtml={preview?.html ?? null}
    />
  );
}

/** The card itself, from what `NewsletterCard` read. */
export function NewsletterCardView({
  schedule,
  nextAt,
  previewHtml,
}: {
  schedule: NewsletterSchedule;
  nextAt: string | null;
  /** The reviewer's own issue; null for a quiet week. */
  previewHtml: string | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Newsletter</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <NewsletterControls schedule={schedule} nextAt={nextAt} />
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Yours, as it stands</h3>
          {previewHtml ? (
            <iframe
              title="Your newsletter, as it stands"
              srcDoc={previewHtml}
              sandbox=""
              className="h-[720px] w-full max-w-[520px] rounded-lg border border-border bg-white"
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              Nothing to tell you this week.
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

/** While the preview is made: the card's title, so nothing jumps. */
export function NewsletterCardSkeleton() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Weekly Newsletter</CardTitle>
        <CardDescription>Loading…</CardDescription>
      </CardHeader>
    </Card>
  );
}
