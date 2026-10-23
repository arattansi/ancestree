import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { after } from "next/server";

import type { Database } from "@/lib/database.types";
import {
  addressPushes,
  EXPO_PUSH_URL,
  goneTokens,
  messagePush,
  pushBatches,
  storyPush,
  type ExpoPush,
  type PushNote,
} from "@/lib/push";
import { createAdminClient } from "@/lib/supabase/admin";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PushFor = { userId: string; note: PushNote };

/**
 * Whom a message just sent should reach on their phones (Step 204), asked
 * as its sender (`supabase`): `claim_message_push` decides, once a
 * message. Who wrote, never what.
 */
export async function claimMessagePush(
  supabase: SupabaseClient<Database>,
  messageId: unknown,
): Promise<PushFor[]> {
  if (typeof messageId !== "string" || !UUID.test(messageId)) return [];
  const { data, error } = await supabase.rpc("claim_message_push", { p_message: messageId });
  if (error) {
    console.error("[push] couldn't claim a message's push", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    note: messagePush({ senderName: r.sender_name, conversationId: r.conversation_id }),
  }));
}

/**
 * Whom a story should reach now (Step 204): those its newest yeses let
 * read it, asked as its teller or someone who said one of them.
 * `claim_story_push` decides, each reader once a story.
 */
export async function claimStoryPush(
  supabase: SupabaseClient<Database>,
  storyId: unknown,
): Promise<PushFor[]> {
  if (typeof storyId !== "string" || !UUID.test(storyId)) return [];
  const { data, error } = await supabase.rpc("claim_story_push", { p_story: storyId });
  if (error) {
    console.error("[push] couldn't claim a story's push", error);
    return [];
  }
  return (data ?? []).map((r) => ({
    userId: r.user_id,
    note: storyPush({ storyId, personId: r.person_id, title: r.title, about: r.about }),
  }));
}

/**
 * Claim now, as the caller, and send once the response has gone: the
 * caller never waits on Expo. For a server action or route handler.
 */
export async function pushAfter(claimed: Promise<PushFor[]>): Promise<void> {
  const pushes = await claimed;
  if (pushes.length) after(() => sendPushes(pushes).then(() => undefined));
}

/**
 * Send each push to every phone its member is signed in on, through Expo's
 * push service, with the service role, which alone reads the phones. A
 * phone Expo says the app is gone from is forgotten. Never throws: a push
 * that can't go is logged, and the in-app counts still say it.
 */
export async function sendPushes(pushes: readonly PushFor[]): Promise<{ sent: number }> {
  if (!pushes.length) return { sent: 0 };
  try {
    const admin = createAdminClient();
    const { data: tokens, error } = await admin
      .from("push_tokens")
      .select("user_id, token")
      .in("user_id", [...new Set(pushes.map((p) => p.userId))]);
    if (error) throw error;
    const addressed = addressPushes(pushes, tokens ?? []);
    let sent = 0;
    const gone: string[] = [];
    for (const batch of pushBatches(addressed)) {
      const answer = await post(batch);
      if (!answer) continue;
      sent += batch.length;
      gone.push(...goneTokens(batch, answer));
    }
    if (gone.length) await admin.from("push_tokens").delete().in("token", gone);
    return { sent };
  } catch (error) {
    console.error("[push] couldn't send", error);
    return { sent: 0 };
  }
}

async function post(batch: ExpoPush[]): Promise<unknown> {
  const access = process.env.EXPO_ACCESS_TOKEN;
  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      // Only once "Enhanced security for push notifications" is on at expo.dev.
      ...(access ? { Authorization: `Bearer ${access}` } : {}),
    },
    body: JSON.stringify(batch),
  });
  if (!response.ok) {
    console.error("[push] Expo answered", response.status, await response.text().catch(() => ""));
    return null;
  }
  return response.json().catch(() => null);
}
