import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import type { NoFamily } from "@/family/load";
import { Spotlight } from "@/leaf/spotlight";
import { useUnread } from "@/messages/store";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { HeaderButton } from "@/ui/header";
import { ChevronLeftIcon, MessageCircleIcon, SearchIcon, UserIcon } from "@/ui/icons";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";
const SITE_NAME = SITE.replace(/^https?:\/\/(www\.)?/, "");

/** Why there's nothing to draw, in as few words as will do (Step 75). */
const NOTHING: Record<NoFamily, { title: string; body: string }> = {
  "no-profile": {
    title: "Not on a tree yet",
    body: `Join your family's tree or start one at ${SITE_NAME}, then sign in here.`,
  },
  "no-tree": {
    title: "Not on a tree yet",
    body: `Join your family's tree or start one at ${SITE_NAME}, then sign in here.`,
  },
  "no-entry": {
    title: "You're not on your tree yet",
    body: `Add yourself at ${SITE_NAME}, then come back.`,
  },
};

/** The member's family, one leaf at a time, opening on their own. */
export default function LeafScreen() {
  const palette = usePalette();
  const { signOut } = useSession();
  const { state, reload, focusId, trail, walkTo, back, home } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const awayFromHome = !!family && focusId !== family.selfId;
  const unread = useUnread();

  return (
    <SafeAreaView
      edges={["top", "bottom", "left", "right"]}
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <View style={styles.header}>
        {trail.length > 0 ? (
          <HeaderButton label="Back" onPress={back}>
            <ChevronLeftIcon color={palette.foreground} />
          </HeaderButton>
        ) : (
          <View style={styles.brand}>
            <Image
              source={require("../../../assets/splash-icon.png")}
              style={styles.mark}
              accessible={false}
            />
            <Text style={[styles.wordmark, { color: palette.foreground }]}>
              ancestree
            </Text>
          </View>
        )}
        <View style={styles.actions}>
          {awayFromHome ? (
            <Button variant="outline" label="you" onPress={home} />
          ) : null}
          {/* Messages and their unread count (Step 179.1), until the menu
              bar takes them (179.4). */}
          {family ? (
            <HeaderButton label="Messages" count={unread} onPress={() => router.push("/messages")}>
              <MessageCircleIcon color={palette.foreground} />
            </HeaderButton>
          ) : null}
          {family ? (
            <HeaderButton label="Find someone" onPress={() => router.push("/search")}>
              <SearchIcon color={palette.foreground} />
            </HeaderButton>
          ) : null}
          <HeaderButton label="Account" onPress={() => router.push("/account")}>
            <UserIcon color={palette.foreground} />
          </HeaderButton>
        </View>
      </View>

      {state.status === "loading" ? (
        <View style={styles.centre}>
          <ActivityIndicator color={palette.green} />
        </View>
      ) : state.status === "failed" ? (
        <Message title={state.message}>
          <Button label="try again" onPress={reload} />
        </Message>
      ) : state.status === "none" ? (
        <Message title={NOTHING[state.why].title} body={NOTHING[state.why].body}>
          <Button variant="outline" label="sign out" onPress={() => void signOut()} />
        </Message>
      ) : focusId ? (
        <Spotlight
          family={state.family}
          focusId={focusId}
          onWalk={walkTo}
          onMore={(side) =>
            router.push({ pathname: "/relatives/[side]", params: { side } })
          }
          onOpenLeaf={() =>
            router.push({ pathname: "/person/[id]", params: { id: focusId } })
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

function Message({
  title,
  body,
  children,
}: {
  title: string;
  body?: string;
  children?: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={[styles.centre, styles.message]}>
      <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
      {body ? (
        <Text style={[styles.body, { color: palette.mutedForeground }]}>{body}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    height: 52,
    paddingHorizontal: GUTTER - 4,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  brand: { flexDirection: "row", alignItems: "center", gap: 8, paddingLeft: 4 },
  mark: { width: 28, height: 28 },
  wordmark: { fontFamily: font.semibold, fontSize: 19, letterSpacing: -0.3 },
  actions: { flexDirection: "row", alignItems: "center", gap: 4 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  message: { paddingHorizontal: GUTTER + 8, gap: 12 },
  title: { fontFamily: font.semibold, fontSize: 20, textAlign: "center" },
  body: {
    fontFamily: font.regular,
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 8,
  },
});
