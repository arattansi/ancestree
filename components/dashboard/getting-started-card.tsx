import { GettingStartedPreview } from "@/components/dashboard/getting-started-preview";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ONBOARDING_KINDS, type OnboardingKind } from "@/lib/onboarding";
import { sendOnboardingEmails, type OnboardingRun } from "@/lib/onboarding.server";
import { isBetaReviewer } from "@/lib/tree-requests.server";

/** Each email's name on the card. */
export const KIND_NAMES: Record<OnboardingKind, string> = {
  claim: "Invite the people you added",
  invite: "Invite family",
  family: "Close family",
  story: "Story or photo",
  winback: "Win-back",
  last: "Last",
};

/**
 * The getting started emails on the admin page's newsletter tab (Step
 * 151): how many are in the drip and what today's run sends (a dry run,
 * counts only), and each email as it would go to the reviewer, with a
 * test to their own address.
 */
export async function GettingStartedCard() {
  if (!(await isBetaReviewer())) return null;
  const today = await sendOnboardingEmails({ dry: true });
  return <GettingStartedCardView today={today} />;
}

/** The card itself, from today's dry run. */
export function GettingStartedCardView({ today }: { today: OnboardingRun }) {
  const going = ONBOARDING_KINDS.flatMap((k) =>
    today.emails[k] ? [`${KIND_NAMES[k]} ${today.emails[k]}`] : [],
  );
  // New to the drip today: their first email waits a day.
  const starting = today.holds["too soon"] ?? 0;
  const tomorrow = starting ? ` ${starting} start tomorrow.` : "";
  return (
    <Card>
      <CardHeader>
        <CardTitle>Getting Started Emails</CardTitle>
        <CardDescription>
          {today.held === "newsletter day"
            ? `${today.due} in the drip. None today: it's the newsletter's day.`
            : `${today.due} in the drip. Today: ${going.length ? going.join(" · ") : "none"}.${tomorrow}`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <GettingStartedPreview names={KIND_NAMES} />
      </CardContent>
    </Card>
  );
}
