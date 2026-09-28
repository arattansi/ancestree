"use client";

import { joinTreeWithInvite } from "@/app/actions/trees";
import { ActionButton } from "@/components/action-button";

/**
 * A signed-in member accepting an invite to another tree (Step 25): one
 * button, no sign-in — they already have an account, so the invite only adds
 * a membership (or, for a founder invite, starts their own tree). A join
 * redirects, and the button stays busy until the tree has opened.
 */
export function JoinTreeButton({
  token,
  label,
}: {
  token: string;
  label: string;
}) {
  return (
    <ActionButton
      action={() => joinTreeWithInvite(token)}
      pendingLabel="Joining…"
      className="w-full"
    >
      {label}
    </ActionButton>
  );
}
