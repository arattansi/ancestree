"use server";

import { revalidatePath } from "next/cache";

import { setMessageEmailsByToken } from "@/lib/message-waiting.server";
import { messageEmailsPageHref } from "@/lib/tree-links";

/**
 * Anyone holding a member's link from an email telling them a message
 * waits (Step 182): turn those emails off, or back on, signed out. The
 * page's buttons post here, so a mail scanner opening the link changes
 * nothing.
 */
export async function setMessageEmailsFromLink(token: string, on: boolean): Promise<void> {
  if (typeof on !== "boolean") return;
  await setMessageEmailsByToken(token, on);
  revalidatePath(messageEmailsPageHref(token));
}
