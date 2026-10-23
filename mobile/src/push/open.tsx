import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as React from "react";

import type { PushData } from "@/lib/push";
import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import { messenger } from "@/messages/store";
import { startPush } from "@/push/push";

// While the app is open a push still shows, but not a message in the
// conversation on screen, which shows it already.
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const data = notification.request.content.data as Partial<PushData> | undefined;
    const shown = data?.kind === "message" && data.conversationId === messenger.openThreadId();
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
 * about: the conversation, or the details of whom the story is about.
 */
export function PushNotifications() {
  const { session } = useSession();
  const { state } = useFamily();
  const userId = session?.user.id ?? null;
  const ready = state.status === "ready";
  React.useEffect(() => {
    if (userId && ready) void startPush();
  }, [userId, ready]);

  const response = Notifications.useLastNotificationResponse();
  React.useEffect(() => {
    if (!ready || !response) return;
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const key = response.notification.request.identifier;
    if (opened.has(key)) return;
    opened.add(key);
    const data = response.notification.request.content.data as Partial<PushData> | undefined;
    if (data?.kind === "message" && data.conversationId) {
      router.push({ pathname: "/messages/[id]", params: { id: data.conversationId } });
    } else if (data?.kind === "story" && data.personId) {
      router.push({ pathname: "/person/[id]", params: { id: data.personId } });
    }
  }, [response, ready]);
  return null;
}
