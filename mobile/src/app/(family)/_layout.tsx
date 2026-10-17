import { Stack } from "expo-router";
import * as React from "react";

import { useSession } from "@/auth/session";
import { FamilyProvider, useFamily } from "@/family/family";
import { messenger } from "@/messages/store";
import { usePalette } from "@/theme";

/** A signed-in member's screens, all over the one family read. */
export default function FamilyLayout() {
  const palette = usePalette();
  const sheet = {
    presentation: "formSheet" as const,
    sheetGrabberVisible: true,
    sheetAllowedDetents: [0.5, 1],
    contentStyle: { backgroundColor: palette.background },
  };
  return (
    <FamilyProvider>
      <MessengerWake />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        {/* The leaf view, feed, messages and settings, behind the menu bar
            (Step 179.4). */}
        <Stack.Screen name="(tabs)" />
        {/* All of someone's details, the whole height (Step 179.5). */}
        <Stack.Screen name="person/[id]" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="relatives/[side]" options={sheet} />
        {/* The + menu and what it opens (Step 179.3). */}
        <Stack.Screen name="add/[id]" options={{ ...sheet, sheetAllowedDetents: [0.34] }} />
        <Stack.Screen name="add/relative/[id]" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="add/photos/[id]" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        <Stack.Screen name="add/story/[id]" options={{ ...sheet, sheetAllowedDetents: [1] }} />
        {/* All of the sheet: the choices before deleting (Step 176). */}
        <Stack.Screen
          name="delete-account"
          options={{ ...sheet, sheetAllowedDetents: [1] }}
        />
        <Stack.Screen
          name="search"
          options={{ presentation: "modal", contentStyle: sheet.contentStyle }}
        />
        {/* Messages (Step 179.1): pushed screens, each with its own header;
            the code scanner over everything. */}
        <Stack.Screen
          name="messages/scan"
          options={{ presentation: "fullScreenModal", contentStyle: sheet.contentStyle }}
        />
        {/* Full screen, and no swipe away: a story half told isn't lost to a
            stray gesture (Step 148). */}
        <Stack.Screen
          name="scribe/[id]"
          options={{
            presentation: "fullScreenModal",
            gestureEnabled: false,
            contentStyle: sheet.contentStyle,
          }}
        />
      </Stack>
    </FamilyProvider>
  );
}

/**
 * Wake the messenger once the member's family has been read (so their
 * profile is there), and forget it when they sign out (Step 179.1).
 */
function MessengerWake() {
  const { session } = useSession();
  const { state } = useFamily();
  const userId = session?.user.id ?? null;
  const ready = state.status === "ready";
  React.useEffect(() => {
    if (userId && ready) messenger.start(userId);
  }, [userId, ready]);
  React.useEffect(() => () => messenger.stop(), []);
  return null;
}
