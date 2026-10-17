import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import type { NoFamily } from "@/family/load";
import { Spotlight } from "@/leaf/spotlight";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { AppHeader } from "@/ui/app-header";
import { HeaderButton } from "@/ui/header";
import { ChevronLeftIcon, PlusIcon, SearchIcon } from "@/ui/icons";

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

/**
 * The member's family, one leaf at a time, opening on their own: home, the
 * middle of the menu bar (Step 179.4). The wordmark brings them back to
 * their own leaf; back retraces the leaves they walked.
 */
export default function LeafScreen() {
  const palette = usePalette();
  const { signOut } = useSession();
  const { state, reload, focusId, trail, walkTo, back } = useFamily();
  const family = state.status === "ready" ? state.family : null;

  return (
    <SafeAreaView
      edges={["top", "left", "right"]}
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <AppHeader
        before={
          trail.length > 0 ? (
            <HeaderButton label="Back" onPress={back}>
              <ChevronLeftIcon color={palette.foreground} />
            </HeaderButton>
          ) : null
        }
      >
        {family && focusId && family.people.get(focusId)?.fullOn.length ? (
          <AddButton
            onPress={() => router.push({ pathname: "/add/[id]", params: { id: focusId } })}
          />
        ) : null}
        {family ? (
          <HeaderButton label="Find someone" onPress={() => router.push("/search")}>
            <SearchIcon color={palette.foreground} />
          </HeaderButton>
        ) : null}
      </AppHeader>

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
          onAdd={(relation) =>
            router.push({ pathname: "/add/relative/[id]", params: { id: focusId, relation } })
          }
        />
      ) : null}
    </SafeAreaView>
  );
}

/**
 * The + (Step 179.3): near-black, as the web's add button is (Step 145),
 * for a relative, photos or a story of whoever is on the leaf view.
 */
function AddButton({ onPress }: { onPress: () => void }) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Add"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.add,
        { backgroundColor: palette.primary },
        pressed && { opacity: 0.7 },
      ]}
    >
      <PlusIcon size={18} color={palette.primaryForeground} />
      <Text style={[styles.addText, { color: palette.primaryForeground }]}>add</Text>
    </Pressable>
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
  add: {
    height: 34,
    paddingLeft: 10,
    paddingRight: 14,
    marginRight: 4,
    borderRadius: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  addText: { fontFamily: font.medium, fontSize: 15 },
  safe: { flex: 1 },
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
