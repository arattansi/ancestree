"use client";

import * as React from "react";

import {
  emailMeAGettingStartedTest,
  previewGettingStartedEmail,
} from "@/app/actions/getting-started";
import { PendingButton } from "@/components/pending-button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import {
  isOnboardingKind,
  ONBOARDING_KINDS,
  type OnboardingKind,
} from "@/lib/onboarding";

/**
 * One getting started email at a time, as it would go to the reviewer now
 * (Step 151), picked from a list; and a test of it to their own address.
 */
export function GettingStartedPreview({
  names,
}: {
  names: Record<OnboardingKind, string>;
}) {
  const [kind, setKind] = React.useState<OnboardingKind>("claim");
  // The last preview made, and which email it is: another is loading
  // while it isn't the one picked.
  const [made, setMade] = React.useState<{
    kind: OnboardingKind;
    subject?: string;
    html: string | null;
  } | null>(null);
  const shown = made?.kind === kind ? made : null;
  const action = useAction({ inline: true });

  React.useEffect(() => {
    let current = true;
    void previewGettingStartedEmail(kind).then((r) => {
      if (current) setMade({ kind, subject: r.subject, html: r.html ?? null });
    });
    return () => {
      current = false;
    };
  }, [kind]);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={kind}
          onValueChange={(v) => {
            if (isOnboardingKind(v)) setKind(v);
          }}
        >
          <SelectTrigger className="w-60" aria-label="Which email">
            <SelectValue>
              {(value: string) => (isOnboardingKind(value) ? names[value] : "")}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {ONBOARDING_KINDS.map((k) => (
              <SelectItem key={k} value={k}>
                {names[k]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <PendingButton
          variant="outline"
          onClick={() =>
            action.run("test", () => emailMeAGettingStartedTest(kind), {
              success: (r) =>
                r.sent ? "Sent to your address." : "You're not in the drip.",
            })
          }
          pending={action.pendingKey === "test"}
          disabled={action.pending}
          pendingLabel="sending…"
        >
          email me a test
        </PendingButton>
      </div>
      {shown === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : shown.html ? (
        <>
          <p className="text-sm">
            <span className="text-muted-foreground">Subject:</span> {shown.subject}
          </p>
          <iframe
            title={`${names[kind]}, as it would go to you`}
            srcDoc={shown.html}
            sandbox=""
            className="h-[720px] w-full max-w-[520px] rounded-lg border border-border bg-white"
          />
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          You&rsquo;re not in the drip.
        </p>
      )}
    </section>
  );
}
