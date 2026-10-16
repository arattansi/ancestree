"use client";

import { useActionState, useState } from "react";

import { startTreeAsNewcomer, startTreeFromCampaign } from "@/app/actions/campaigns";
import { ActionButton } from "@/components/action-button";
import { JoinConsent, NameFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import type { RequestFormState } from "@/lib/request-forms";

const INITIAL: RequestFormState = {};

/**
 * A member opening a campaign link (Step 103.3): one button starts their
 * own tree. It redirects, and stays busy until the tree has opened.
 */
export function CampaignStartButton({ code }: { code: string }) {
  return (
    <ActionButton
      action={() => startTreeFromCampaign(code)}
      pendingLabel="starting…"
      className="w-full"
    >
      start my tree
    </ActionButton>
  );
}

/**
 * Signed in, not a member yet, opening a campaign link (Step 160): their
 * address is verified, so they give their name and the privacy agreement,
 * and the button starts their tree — no email, no second code. `name` is
 * the one their account keeps, when it keeps one.
 */
export function CampaignNewcomerForm({
  code,
  name,
}: {
  code: string;
  name?: { firstName: string; lastName: string };
}) {
  const [state, formAction, pending] = useActionState(startTreeAsNewcomer, INITIAL);
  const [consented, setConsented] = useState(false);
  const errorId = state.error ? "start-error" : undefined;

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      <input type="hidden" name="code" value={code} />
      <NameFields idPrefix="start" state={state} errorId={errorId} defaultName={name} />
      {state.error ? (
        <p id={errorId} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <JoinConsent id="start-consent" checked={consented} onCheckedChange={setConsented} />
      <Button type="submit" disabled={pending || !consented}>
        {pending ? "starting…" : "start my tree"}
      </Button>
    </form>
  );
}
