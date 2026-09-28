"use client";

import * as React from "react";
import { toast } from "sonner";

import { decideEntrySuggestion } from "@/app/actions/suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Accept or decline a suggested change (Step 67), on the entry's card or in
 * the notice that asks. Declining first asks why (Step 69); the suggester
 * reads it in the notice that tells them, and it can be left empty.
 */
export function SuggestionAnswer({ suggestionId }: { suggestionId: string }) {
  const [declining, setDeclining] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const reasonId = `decline-reason-${suggestionId}`;

  async function answer(accept: boolean) {
    setBusy(true);
    const res = await decideEntrySuggestion(
      suggestionId,
      accept,
      accept ? undefined : reason,
    );
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(accept ? "Accepted." : "Declined.");
  }

  if (!declining) {
    return (
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy} onClick={() => answer(true)}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setDeclining(true)}
        >
          Decline
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={reasonId} className="text-xs">
        Reason (optional)
      </Label>
      <Input
        id={reasonId}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        maxLength={500}
        disabled={busy}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => answer(false)}
        >
          {busy ? "Declining…" : "Decline"}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => {
            setDeclining(false);
            setReason("");
          }}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
