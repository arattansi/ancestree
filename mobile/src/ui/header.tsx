import { router } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { badgeCount } from "@/lib/messenger";
import { font, GUTTER, usePalette } from "@/theme";
import { ChevronLeftIcon } from "@/ui/icons";

/** An icon in a header, 44 points square, with an optional count on it. */
export function HeaderButton({
  label,
  onPress,
  count = 0,
  children,
}: {
  label: string;
  onPress: () => void;
  /** Unread, as the web's launcher badge shows it: 1 to 9, then "9+". */
  count?: number;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} unread` : label}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => [styles.iconButton, pressed && { opacity: 0.6 }]}
    >
      {children}
      {count > 0 ? (
        <View style={[styles.badge, { backgroundColor: palette.destructiveSolid }]}>
          <Text style={styles.badgeText}>{badgeCount(count)}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * A screen's own header (the app has no navigation bar): back, a title,
 * and the screen's icons on the right.
 */
export function ScreenHeader({
  title,
  back = true,
  children,
}: {
  title: React.ReactNode;
  back?: boolean;
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.header, { borderBottomColor: palette.border }]}>
      {back ? (
        <HeaderButton label="Back" onPress={() => router.back()}>
          <ChevronLeftIcon color={palette.foreground} />
        </HeaderButton>
      ) : null}
      <View style={[styles.title, !back && { paddingLeft: 8 }]}>
        {typeof title === "string" ? (
          <Text numberOfLines={1} style={[styles.titleText, { color: palette.foreground }]}>
            {title}
          </Text>
        ) : (
          title
        )}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  badge: {
    position: "absolute",
    top: 4,
    right: 2,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: {
    color: "#ffffff",
    fontFamily: font.semibold,
    fontSize: 11,
    fontVariant: ["tabular-nums"],
  },
  header: {
    minHeight: 56,
    paddingHorizontal: GUTTER - 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  title: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center" },
  titleText: { fontFamily: font.semibold, fontSize: 17 },
});
