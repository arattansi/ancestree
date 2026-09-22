"use client";

import * as React from "react";
import { toast } from "sonner";

import { joinTreeWithInvite } from "@/app/actions/trees";
import { Button } from "@/components/ui/button";

/**
 * A signed-in member accepting an invite to another tree (Step 25): one
 * button, no sign-in — they already have an account, so the invite only adds
 * a membership (or, for a founder invite, starts their own tree).
 */
export function JoinTreeButton({
  token,
  label,
}: {
  token: string;
  label: string;
}) {
  const [pending, setPending] = React.useState(false);

  async function onClick() {
    setPending(true);
    const res = await joinTreeWithInvite(token);
    // A successful join redirects; only a refusal comes back.
    setPending(false);
    if (res?.error) toast.error(res.error);
  }

  return (
    <Button onClick={onClick} disabled={pending} className="w-full">
      {pending ? "Joining…" : label}
    </Button>
  );
}
