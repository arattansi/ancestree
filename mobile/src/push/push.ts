import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { PUSH_CHANNELS, type PushForget } from "@/lib/push";
import { supabase } from "@/auth/supabase";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/**
 * Push notifications on this phone (Step 204): a new message (who wrote,
 * never what), a new story and (Step 217.4) birthday cards. The web sends them through Expo's push
 * service to every phone a member is signed in on; this file asks the
 * member whether it may, hands the web this phone's token, and gives it
 * back when they're no longer signed in here. What a push opens is
 * `./open.tsx`.
 *
 * The token and whose it is are kept on the phone (`GIVEN`), so giving it
 * back doesn't depend on what this run of the app remembers; one that
 * couldn't be given back is kept too (`OWED`) and tried again, with no
 * session, through `/api/mobile/push/forget`.
 */

/** The token this phone gave, and for whom. */
const GIVEN = "push.given";
/** A token still to be given back: the member is gone from this phone. */
const OWED = "push.owed";

/** Nothing is kept in a browser (the dev preview has no pushes). */
const kept = Platform.OS !== "web";

async function readKept(key: string): Promise<PushForget | null> {
  if (!kept) return null;
  try {
    const raw = await SecureStore.getItemAsync(key);
    const value = raw ? (JSON.parse(raw) as Partial<PushForget> | null) : null;
    return value?.token && value.userId ? { token: value.token, userId: value.userId } : null;
  } catch {
    return null;
  }
}

async function keep(key: string, value: PushForget | null): Promise<void> {
  if (!kept) return;
  try {
    if (value) await SecureStore.setItemAsync(key, JSON.stringify(value));
    else await SecureStore.deleteItemAsync(key);
  } catch {
    // The Keychain said no: nothing more to do about it here.
  }
}

/** The giving under way, so a sign-out waits for it before giving back. */
let starting: Promise<PushPermission> | null = null;

export type PushPermission = "granted" | "denied" | "undetermined";

/**
 * Ask once whether the app may notify them (iOS asks only the first time;
 * Android 13 and later ask when the first channel is made), then give the
 * web this phone's token, every time the app opens signed in, so it stays
 * theirs. A phone that can't have a token (no push key yet for the build,
 * or a simulator) quietly gets none.
 */
export function startPush(userId: string): Promise<PushPermission> {
  const run = give(userId).finally(() => {
    if (starting === run) starting = null;
  });
  starting = run;
  return run;
}

async function give(userId: string): Promise<PushPermission> {
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
    // Kept before it's given: if the answer never comes back, it may still
    // have been taken, and signing out gives it back all the same.
    await keep(GIVEN, { token, userId });
    const { error } = await supabase.rpc("register_push_token", {
      p_token: token,
      p_platform: Platform.OS === "ios" ? "ios" : "android",
    });
    // Theirs now, whoever's it was: nothing is owed for it any more.
    if (!error) await keep(OWED, null);
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

/**
 * Signing out, while still signed in: this phone tells nobody of the
 * member's family any more. The token is owed from here on, and stays owed
 * until the web has said it's forgotten: `settlePush` asks again.
 */
export async function forgetPush(): Promise<void> {
  // A giving under way lands first, or it would land after this.
  await starting?.catch(() => {});
  const given = await readKept(GIVEN);
  if (!given) return;
  await keep(OWED, given);
  await keep(GIVEN, null);
  const { error } = await supabase.rpc("forget_push_token", { p_token: given.token });
  if (!error) await keep(OWED, null);
}

/**
 * Nobody is signed in: give back whatever this phone still has out. A
 * token given for a member who left some other way (the session refused,
 * the account deleted) is owed too. Asked with no session, the token
 * itself the say-so; one that can't be reached stays owed for next time.
 */
export async function settlePush(): Promise<void> {
  await starting?.catch(() => {});
  const given = await readKept(GIVEN);
  if (given) {
    await keep(OWED, given);
    await keep(GIVEN, null);
  }
  const owed = await readKept(OWED);
  if (!owed) return;
  try {
    const response = await fetch(`${SITE}/api/mobile/push/forget`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(owed),
    });
    // Unless it was owed afresh meanwhile, it's settled.
    const now = await readKept(OWED);
    if (response.ok && now?.token === owed.token && now.userId === owed.userId) {
      await keep(OWED, null);
    }
  } catch {
    // No connection: still owed.
  }
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
  await Notifications.setNotificationChannelAsync("cards", {
    name: PUSH_CHANNELS.cards,
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

export type PushSettings = { messages: boolean; stories: boolean; cards: boolean };

/** The member's switches, each on until they turn it off. */
export async function readPushSettings(): Promise<PushSettings> {
  const { data, error } = await supabase
    .from("push_settings")
    .select("messages, stories, cards")
    .maybeSingle();
  if (error) throw error;
  return {
    messages: data?.messages ?? true,
    stories: data?.stories ?? true,
    cards: data?.cards ?? true,
  };
}

export async function savePushSettings(settings: PushSettings): Promise<void> {
  const { error } = await supabase.rpc("set_push_settings", {
    p_messages: settings.messages,
    p_stories: settings.stories,
    p_cards: settings.cards,
  });
  if (error) throw error;
}

/**
 * A birthday card started from the phone (Step 221): the web tells those
 * it told in the app on their phones too (`/api/mobile/cards/push`), each
 * once a card.
 */
export async function cardStarted(cardId: string): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch(`${SITE}/api/mobile/cards/push`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ cardId }),
  }).catch(() => {});
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
