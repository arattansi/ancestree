import { router } from "expo-router";
import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { useFamily } from "@/family/family";
import { font, GUTTER, usePalette } from "@/theme";

/** Back to the member's own leaf, on the home tab: the wordmark's tap. */
export function useGoHome() {
  const { home } = useFamily();
  return React.useCallback(() => {
    home();
    router.navigate("/");
  }, [home]);
}

/**
 * The top of every main screen (Step 179.4): the ancestree wordmark on the
 * left, wherever the member is, and the screen's own icons on the right.
 * Tapping the wordmark takes them back to their own leaf (Aalim: "the
 * ancestree wordmark should stay regardless of where the user navigates.
 * clicking on the wordmark should return them to your node").
 */
export function AppHeader({
  beside,
  children,
}: {
  /** Beside the wordmark: the leaf view's tree picker (Step 206). */
  beside?: React.ReactNode;
  /** The screen's icons, on the right. */
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  const goHome = useGoHome();
  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="ancestree"
        accessibilityHint="Back to your own leaf"
        onPress={goHome}
        hitSlop={8}
        style={({ pressed }) => [styles.brand, pressed && { opacity: 0.6 }]}
      >
        <Image
          source={require("../../assets/splash-icon.png")}
          style={styles.mark}
          accessible={false}
        />
        <Text style={[styles.wordmark, { color: palette.foreground }]}>ancestree</Text>
      </Pressable>
      {beside}
      <View style={styles.actions}>{children}</View>
    </View>
  );
}

/** A main screen's title, under the header: "Messages", "Settings". */
export function ScreenTitle({ children }: { children: string }) {
  const palette = usePalette();
  return (
    <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  header: {
    height: 52,
    paddingHorizontal: GUTTER - 12,
    flexDirection: "row",
    alignItems: "center",
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingVertical: 6,
    paddingLeft: 12,
  },
  mark: { width: 26, height: 26 },
  wordmark: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.4 },
  actions: {
    marginLeft: "auto",
    flexShrink: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 2,
  },
  title: {
    fontFamily: font.semibold,
    fontSize: 26,
    letterSpacing: -0.4,
    paddingHorizontal: GUTTER,
    paddingTop: 4,
    paddingBottom: 10,
  },
});
