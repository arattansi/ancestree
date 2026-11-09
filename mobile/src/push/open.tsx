import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as React from "react";

import { pushIsFor, type PushData } from "@/lib/push";
import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import { messenger } from "@/messages/store";
import { startPush } from "@/push/push";

/** Who is signed in on this phone, for the handler below. */
let signedIn: string | null = null;

// While the app is open a push still shows, but not a message in the
// conversation on screen, which shows it already, and not one for a member
// who was signed in here before (their token not yet given back).
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Partial<PushData> | undefined;
    const shown =
      !pushIsFor(data, signedIn) ||
      (data?.kind === "message" && data.conversationId === messenger.openThreadId());
    return {
      shouldShowBanner: !shown,
      shouldShowList: !shown,
      shouldPlaySound: !shown,
      shouldSetBadge: false,
    };
  },
});

/** Pushes already opened, so the last one isn't opened again on a return. */
const opened = new Set<string>();

/**
 * Push notifications for a signed-in member (Step 204): once their family
 * is read, ask whether the app may notify them and give the web this
 * phone's token; and a push tapped, the app open or not, opens what it's
 * about: the conversation, the details of whom the story is about, or of
 * whose birthday card it is. Each push says whose it is (`userId` in its
 * data); one for somebody else is neither shown nor opened.
 */
export function PushNotifications() {
  const { session } = useSession();
  const { state } = useFamily();
  const userId = session?.user.id ?? null;
  const ready = state.status === "ready";
  React.useEffect(() => {
    signedIn = userId;
    if (userId && ready) void startPush(userId);
  }, [userId, ready]);

  const response = Notifications.useLastNotificationResponse();
  React.useEffect(() => {
    if (!ready || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = response.notification.request.identifier;
    if (opened.has(key)) return;
    opened.add(key);
    const data = response.notification.request.content.data as Partial<PushData> | undefined;
    // One sent to whoever was signed in here before opens nothing of theirs.
    if (!pushIsFor(data, userId)) return;
    if (data?.kind === "message" && data.conversationId) {
      router.push({ pathname: "/messages/[id]", params: { id: data.conversationId } });
    } else if (data?.kind === "story" && data.personId) {
      router.push({ pathname: "/person/[id]", params: { id: data.personId } });
    } else if (data?.kind === "card" && data.personId) {
      // Their own card on the day opens straight away (Step 217.4).
      router.push({
        pathname: "/person/[id]",
        params: data.open ? { id: data.personId, card: "open" } : { id: data.personId },
      });
    }
  }, [response, ready, userId]);
  return null;
}
