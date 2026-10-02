"use client";

import { startTreeFromCampaign } from "@/app/actions/campaigns";
import { ActionButton } from "@/components/action-button";

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
