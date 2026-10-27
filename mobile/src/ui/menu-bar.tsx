import { router } from "expo-router";
import * as React from "react";
import { Image, Pressable, StyleSheet, Text, View, type PressableProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { personInitials } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { usePhotoUrl } from "@/family/photo";
import { useNotices } from "@/feed/notices";
import { useUnread } from "@/messages/store";
import { font, usePalette } from "@/theme";
import { AppleMark, CalendarIcon, FeatherIcon, MessageSquareIcon } from "@/ui/icons";

/** How tall the bar is above the home indicator. */
export const MENU_BAR_H = 58;
const USER = 30;
/** The apple the unread count is on. */
const COUNT = 24;

/** What a tab trigger hands the button it wraps (`asChild`). */
type SlotProps = Omit<PressableProps, "children"> & {
  isFocused?: boolean;
  ref?: React.Ref<View>;
};

/**
 * The menu bar along the bottom (Step 179.4, Aalim's order): record, feed
 * and notifications, home in the middle, messages, and the member
 * themself for settings. Only home (the ancestree mark) and the member
 * (their own photo) are in colour; the rest are line icons in the
 * foreground when theirs is the screen shown, muted otherwise.
 */
export function MenuBar({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  return (
    <View
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          paddingBottom: insets.bottom,
          height: MENU_BAR_H + insets.bottom,
          backgroundColor: palette.background,
          borderTopColor: palette.border,
        },
      ]}
    >
      {children}
    </View>
  );
}

function Slot({
  label,
  isFocused,
  children,
  ...props
}: SlotProps & { label: string; children: React.ReactNode }) {
  return (
    <Pressable
      {...props}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: !!isFocused }}
      hitSlop={4}
      style={({ pressed }) => [styles.slot, pressed && { opacity: 0.6 }]}
    >
      {children}
    </Pressable>
  );
}

/**
 * Record: straight to the scribe, for whoever is on the leaf view (the
 * member, at first). Not a tab: the scribe is a screen of its own over
 * everything, as a story half told mustn't be lost to a stray tap.
 */
export function RecordButton() {
  const palette = usePalette();
  const { state, focusId } = useFamily();
  const id = focusId ?? (state.status === "ready" ? state.family.selfId : null);
  return (
    <Slot
      label="Record a story"
      disabled={!id}
      onPress={() => id && router.push({ pathname: "/scribe/[id]", params: { id } })}
    >
      <FeatherIcon color={id ? palette.mutedForeground : palette.border} size={25} />
    </Slot>
  );
}

/** Feed and notifications: a calendar, and a red apple on it when there's news. */
export const FeedButton = React.forwardRef<View, SlotProps>(function FeedButton(props, ref) {
  const palette = usePalette();
  const unread = useNotices((s) => s.unread);
  const color = props.isFocused ? palette.foreground : palette.mutedForeground;
  return (
    <Slot {...props} ref={ref} label={unread ? `Feed, ${unread} new` : "Feed"}>
      <View>
        <CalendarIcon color={color} size={25} />
        {unread ? (
          <View style={styles.apple}>
            <AppleMark size={15} color={palette.red} ring={palette.background} />
          </View>
        ) : null}
      </View>
    </Slot>
  );
});

/** Home: the ancestree mark, in colour, back to the leaf view. */
export const HomeButton = React.forwardRef<View, SlotProps>(function HomeButton(props, ref) {
  return (
    <Slot {...props} ref={ref} label="Home">
      <Image
        source={require("../../assets/splash-icon.png")}
        style={[styles.home, { opacity: props.isFocused ? 1 : 0.75 }]}
        accessible={false}
      />
    </Slot>
  );
});

/**
 * Messages: a dialogue box, with the unread count on a red apple, as the
 * feed's news is marked (Step 209).
 */
export const MessagesButton = React.forwardRef<View, SlotProps>(function MessagesButton(props, ref) {
  const palette = usePalette();
  const unread = useUnread();
  const color = props.isFocused ? palette.foreground : palette.mutedForeground;
  return (
    <Slot {...props} ref={ref} label={unread ? `Messages, ${unread} unread` : "Messages"}>
      <View>
        <MessageSquareIcon color={color} size={25} />
        {unread ? (
          <View style={styles.count}>
            <AppleMark size={COUNT} color={palette.red} ring={palette.background} />
            <Text style={styles.countText}>{unread > 9 ? "9+" : unread}</Text>
          </View>
        ) : null}
      </View>
    </Slot>
  );
});

/**
 * The member, for settings: their own photo, round; their initials on the
 * leaf's green while there's none. A ring round it on its own screen.
 */
export const YouButton = React.forwardRef<View, SlotProps>(function YouButton(props, ref) {
  const palette = usePalette();
  const { state } = useFamily();
  const self = state.status === "ready" ? state.family.people.get(state.family.selfId) : null;
  const photo = usePhotoUrl(self?.photo_path, USER);
  return (
    <Slot {...props} ref={ref} label="You and settings">
      <View
        style={[
          styles.you,
          { borderColor: props.isFocused ? palette.foreground : "transparent" },
        ]}
      >
        {photo ? (
          <Image source={{ uri: photo }} style={styles.youImage} accessible={false} />
        ) : (
          <View style={[styles.youImage, styles.youInitials, { backgroundColor: palette.green }]}>
            <Text style={styles.youText}>{self ? personInitials(self) : ""}</Text>
          </View>
        )}
      </View>
    </Slot>
  );
});

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  slot: {
    flex: 1,
    height: MENU_BAR_H,
    alignItems: "center",
    justifyContent: "center",
  },
  apple: { position: "absolute", top: -5, right: -6 },
  home: { width: 36, height: 36 },
  count: { position: "absolute", top: -10, right: -11, width: COUNT, height: COUNT },
  // On the apple's body, which is a little below the middle of its box.
  countText: {
    position: "absolute",
    left: 0,
    right: 0,
    top: COUNT * 0.555 - 6,
    textAlign: "center",
    fontFamily: font.semibold,
    fontSize: 10,
    lineHeight: 12,
    color: "#ffffff",
    fontVariant: ["tabular-nums"],
  },
  you: {
    width: USER + 6,
    height: USER + 6,
    borderRadius: (USER + 6) / 2,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  youImage: { width: USER, height: USER, borderRadius: USER / 2 },
  youInitials: { alignItems: "center", justifyContent: "center" },
  youText: { fontFamily: font.semibold, fontSize: 12, color: "#ffffff" },
});
