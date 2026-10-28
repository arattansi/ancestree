"use server";

import { getSessionUser } from "@/lib/auth";
import { isInviteToken, SHARE_CHANNELS, type ShareChannel } from "@/lib/invite-events";
import { createClient } from "@/lib/supabase/server";

/**
 * A share button pressed on an invite (Step 216): which one, counted for the
 * analytics tab. The database says whether this member may share it (its
 * sender, a Root, or anyone who may invite someone to claim its entry); a
 * count that doesn't take is only logged, never shown.
 */
export async function noteInviteShared(token: string, channel: ShareChannel): Promise<void> {
  if (!isInviteToken(token) || !SHARE_CHANNELS.includes(channel)) return;
  if (!(await getSessionUser())) return;
  const supabase = await createClient();
  const { error } = await supabase.rpc("note_invite_shared", {
    p_token: token,
    p_channel: channel,
  });
  if (error) console.error(`[invite-events] ${channel} share not noted — ${error.message}`);
}
