"use server";

import { revalidatePath } from "next/cache";

import { setCardEmailsByToken } from "@/lib/card-last-calls.server";
import { cardEmailsPageHref } from "@/lib/tree-links";

/**
 * Anyone holding a member's link from a "last chance to sign" email (Step
 * 232): turn those emails off, or back on, signed out. The page's buttons
 * post here, so a mail scanner opening the link changes nothing.
 */
export async function setCardEmailsFromLink(token: string, on: boolean): Promise<void> {
  if (typeof on !== "boolean") return;
  await setCardEmailsByToken(token, on);
  revalidatePath(cardEmailsPageHref(token));
}
