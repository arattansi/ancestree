import type { ComponentProps } from "react";

import { MagicLinkForm } from "@/components/magic-link-form";
import { readSentCodeFor } from "@/lib/sent-code.server";

/**
 * `MagicLinkForm` as a page shows it: opening on the code box when this
 * form, for this same link, emailed a code within the hour, so a reload on
 * "Check your email" doesn't drop it (Step 164).
 */
export async function MagicLinkSignIn(
  props: Omit<ComponentProps<typeof MagicLinkForm>, "sent">,
) {
  const sent = await readSentCodeFor({
    inviteToken: props.inviteToken,
    campaign: props.campaign,
  });
  return <MagicLinkForm {...props} sent={sent ?? undefined} />;
}
