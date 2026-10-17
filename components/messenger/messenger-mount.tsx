import { unstable_rethrow } from "next/navigation";

import { Messenger } from "@/components/messenger/messenger";
import { getProfile } from "@/lib/auth";
import { listMyTrees } from "@/lib/tree-context";

/**
 * The messenger's launcher for a member on at least one tree (Step 174),
 * streamed in on its own beside the header, which reads the same two
 * things: nobody else has anyone to write to. A failure to read them
 * leaves the page without it rather than an error page.
 */
export async function MessengerMount() {
  const userId = await messengerUser();
  return userId ? <Messenger userId={userId} /> : null;
}

async function messengerUser(): Promise<string | null> {
  try {
    const [profile, trees] = await Promise.all([getProfile(), listMyTrees()]);
    return profile && trees.length > 0 ? profile.auth_user_id : null;
  } catch (error) {
    unstable_rethrow(error);
    console.error("[messenger] couldn't tell who's signed in", error);
    return null;
  }
}
