import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { initialsOf } from "@/lib/messenger";
import { font, GUTTER, usePalette } from "@/theme";
import { useMessenger } from "@/messages/store";

/*
 * The messenger screens' small parts (Step 179.1), drawn as the web's
 * pop-up draws them.
 */

/** A face: their initials in a muted circle (no photos on the phone yet). */
export function Face({ name, size = 40 }: { name: string; size?: number }) {
  const palette = usePalette();
  return (
    <View
      accessible={false}
      style={[
        styles.face,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: palette.muted },
      ]}
    >
      <Text
        style={[
          styles.initials,
          { color: palette.mutedForeground, fontSize: Math.max(11, Math.round(size * 0.32)) },
        ]}
      >
        {initialsOf(name)}
      </Text>
    </View>
  );
}

/** Words in the middle of a screen, and what to do about them. */
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <ScrollView
      contentContainerStyle={styles.notice}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
    >
      {children}
    </ScrollView>
  );
}

/** A titled part of a screen, as the web's `<section>` with its `<h3>`. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.foreground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Plain words, muted or not. */
export function Words({
  children,
  muted = false,
  center = false,
  strong = false,
  italic = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
  center?: boolean;
  strong?: boolean;
  italic?: boolean;
}) {
  const palette = usePalette();
  return (
    <Text
      style={[
        styles.words,
        { color: muted ? palette.mutedForeground : palette.foreground },
        center && { textAlign: "center" },
        strong && { fontFamily: font.medium },
        italic && { fontStyle: "italic" },
      ]}
    >
      {children}
    </Text>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <Text
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[styles.words, { color: palette.destructive }]}
    >
      {children}
    </Text>
  );
}

/** Who's on the other side of a conversation: from the list, or the contact it was opened with. */
export type Peer = {
  userId: string | null;
  name: string;
  personId: string | null;
  canSend: boolean;
  /** Null until they next open messages: nothing can be sealed to them. */
  keyVersion: number | null;
  /** Muted until then (Step 177.4); null when it isn't. */
  mutedUntil: string | null;
  /** Who blocked whom (Step 177.3). */
  blocked: "by_you" | "by_them" | null;
};

export function usePeer(id: string): Peer | null {
  const summary = useMessenger((s) => s.data?.conversations.find((c) => c.id === id));
  const peerId = useMessenger((s) => s.peers[id]);
  const contact = useMessenger((s) =>
    peerId ? s.data?.contacts.find((c) => c.userId === peerId) : undefined,
  );
  if (summary)
    return {
      userId: summary.otherUserId,
      name: summary.name,
      personId: summary.personId,
      canSend: summary.canSend,
      keyVersion: summary.otherKeyVersion,
      mutedUntil: summary.mutedUntil,
      blocked: summary.blocked,
    };
  if (contact)
    return {
      userId: contact.userId,
      name: contact.name,
      personId: contact.personId,
      canSend: true,
      keyVersion: contact.keyVersion,
      mutedUntil: null,
      blocked: null,
    };
  return null;
}

/** Their first name, for "Say hello to Leila". */
export const firstOf = (name: string | undefined, fallback: string) =>
  name?.split(" ")[0] || fallback;

const styles = StyleSheet.create({
  face: { alignItems: "center", justifyContent: "center" },
  initials: { fontFamily: font.medium },
  notice: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: GUTTER + 8,
    paddingVertical: 32,
  },
  section: { gap: 10 },
  sectionTitle: { fontFamily: font.semibold, fontSize: 17 },
  words: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
});
