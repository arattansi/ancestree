import { Stack } from "expo-router";
import * as React from "react";

import { FamilyProvider } from "@/family/family";
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
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.background },
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="person/[id]" options={sheet} />
        <Stack.Screen name="relatives/[side]" options={sheet} />
        <Stack.Screen name="account" options={sheet} />
        {/* Over the account sheet, all of it: the choices before deleting
            (Step 176). */}
        <Stack.Screen
          name="delete-account"
          options={{ ...sheet, sheetAllowedDetents: [1] }}
        />
        <Stack.Screen
          name="search"
          options={{ presentation: "modal", contentStyle: sheet.contentStyle }}
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
