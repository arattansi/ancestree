import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { PUSH_CHANNELS } from "@/lib/push";
import { supabase } from "@/auth/supabase";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/**
 * Push notifications on this phone (Step 204): a new message (who wrote,
 * never what) and a new story. The web sends them through Expo's push
 * service to every phone a member is signed in on; this file asks the
 * member whether it may, hands the web this phone's token, and gives it
 * back on signing out. What a push opens is `./open.tsx`.
 */

/** This phone's Expo token, once given for the member signed in. */
let given: string | null = null;

export type PushPermission = "granted" | "denied" | "undetermined";

/**
 * Ask once whether the app may notify them (iOS asks only the first time;
 * Android 13 and later ask when the first channel is made), then give the
 * web this phone's token, every time the app opens signed in, so it stays
 * theirs. A phone that can't have a token (no push key yet for the build,
 * or a simulator) quietly gets none.
 */
export async function startPush(): Promise<PushPermission> {
  try {
    if (Platform.OS === "android") await makeChannels();
    let permission = await Notifications.getPermissionsAsync();
    if (!permission.granted && permission.canAskAgain) {
      permission = await Notifications.requestPermissionsAsync();
    }
    if (!permission.granted) return permission.status === "denied" ? "denied" : "undetermined";
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
    const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS === "ios" ? "ios" : "android",
    });
    if (!error) given = token;
    return "granted";
  } catch {
    return "undetermined";
  }
}

/** Whether the phone lets the app notify them, without asking. */
export async function pushPermission(): Promise<PushPermission> {
  try {
    const permission = await Notifications.getPermissionsAsync();
    return permission.granted ? "granted" : permission.status === "denied" ? "denied" : "undetermined";
  } catch {
    return "undetermined";
  }
}

/** Signing out: this phone tells nobody of the member's family any more. */
export async function forgetPush(): Promise<void> {
  const token = given;
  given = null;
  if (!token) return;
  await supabase.rpc("forget_push_token", { p_token: token });
}

/** Android's channels, one a kind, so each can be turned off in its settings. */
async function makeChannels() {
  await Notifications.setNotificationChannelAsync("messages", {
    name: PUSH_CHANNELS.messages,
    importance: Notifications.AndroidImportance.HIGH,
  });
  await Notifications.setNotificationChannelAsync("stories", {
    name: PUSH_CHANNELS.stories,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PushSettings = { messages: boolean; stories: boolean };

/** The member's two switches, both on until they turn one off. */
export async function readPushSettings(): Promise<PushSettings> {
  const { data, error } = await supabase
    .from("push_settings")
    .select("messages, stories")
    .maybeSingle();
  if (error) throw error;
  return { messages: data?.messages ?? true, stories: data?.stories ?? true };
}

export async function savePushSettings(settings: PushSettings): Promise<void> {
  const { error } = await supabase.rpc("set_push_settings", {
    p_messages: settings.messages,
    p_stories: settings.stories,
  });
  if (error) throw error;
}

/**
 * A story told, or more people put in one, from the phone: the web tells
 * those it now shows to (`/api/mobile/stories/push`), each once a story.
 */
export async function storyTold(storyId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch(`${SITE}/api/mobile/stories/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ storyId }),
  }).catch(() => {});
}
