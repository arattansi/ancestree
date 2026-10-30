import { router } from "expo-router";
import * as React from "react";
import {
  Image,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shownEmail } from "@/lib/no-email";
import { personDisplayName, personInitials } from "@/lib/person-name";
import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import type { Family } from "@/family/load";
import { usePhotoUrl } from "@/family/photo";
import { leavesToEdit } from "@/person/edit";
import {
  pushPermission,
  readPushSettings,
  savePushSettings,
  type PushPermission,
  type PushSettings,
} from "@/push/push";
import { font, GUTTER, usePalette } from "@/theme";
import { AppHeader, ScreenTitle } from "@/ui/app-header";
import { Button } from "@/ui/button";
import { ChevronDownIcon } from "@/ui/icons";
import { TextField } from "@/ui/text-field";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";
const FACE = 64;
/** How many of their leaves are listed before it takes a search. */
const LEAVES_SHOWN = 8;

/**
 * The member and their settings, the right end of the menu bar (Step
 * 179.4): who's signed in, their leaves to edit (Step 203, folded away
 * under their own since Step 209), what the phone notifies them of (Step
 * 204), signing out, the privacy notice, message security, and deleting
 * the account (Step 176), which the App Store asks every app with accounts
 * for.
 */
export default function Settings() {
  const palette = usePalette();
  const { session, signOut } = useSession();
  const { state } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const self = family ? (family.people.get(family.selfId) ?? null) : null;
  const name = self ? personDisplayName(self) : (family?.displayName ?? null);
  const photo = usePhotoUrl(self?.photo_path, FACE);

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <ScreenTitle>Settings</ScreenTitle>
        <View style={styles.who}>
          {photo ? (
            <Image source={{ uri: photo }} style={styles.face} accessible={false} />
          ) : (
            <View style={[styles.face, styles.initials, { backgroundColor: palette.green }]}>
              <Text style={styles.initialsText}>{self ? personInitials(self) : ""}</Text>
            </View>
          )}
          <View style={styles.names}>
            {name ? (
              <Text numberOfLines={1} style={[styles.name, { color: palette.foreground }]}>
                {name}
              </Text>
            ) : null}
            <Text numberOfLines={1} style={[styles.email, { color: palette.mutedForeground }]}>
              {shownEmail(session?.user.email)}
            </Text>
          </View>
        </View>
        <View style={styles.actions}>
          {self ? (
            <Button
              variant="outline"
              label="your leaf"
              onPress={() => router.push({ pathname: "/person/[id]", params: { id: self.id } })}
            />
          ) : null}
          {family && session ? <EditLeaves family={family} userId={session.user.id} /> : null}
        </View>
        <Notifications />
        <View style={styles.actions}>
          <Button
            variant="outline"
            label="message security"
            onPress={() => router.push("/messages/security")}
          />
          <Button variant="outline" label="sign out" onPress={() => void signOut()} />
          <Button
            variant="destructive-outline"
            label="delete my account"
            onPress={() => router.push("/delete-account")}
          />
        </View>
        <View style={styles.links}>
          <Button
            variant="link"
            label="Privacy"
            accessibilityRole="link"
            onPress={() => void Linking.openURL(`${SITE}/privacy`)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

/**
 * Their own leaf and the leaves they own, each opening its details to edit
 * (Step 203); a search once there are more than a handful. Folded away
 * under "your leaf" until opened (Step 209): most visits aren't to edit
 * anyone, and a long list pushed the rest of the settings down.
 */
function EditLeaves({ family, userId }: { family: Family; userId: string }) {
  const palette = usePalette();
  const [ids, setIds] = React.useState<string[] | null>(null);
  const [failed, setFailed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    leavesToEdit(family, userId)
      .then((leaves) => {
        if (!live) return;
        setIds(leaves);
        setFailed(false);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [family, userId]);

  if (failed && !ids) {
    return (
      <Text style={[styles.leavesNote, { color: palette.mutedForeground }]}>
        Your leaves couldn&apos;t be read.
      </Text>
    );
  }
  if (!ids?.length) return null;
  const nameOf = (id: string) =>
    id === family.selfId ? "You" : personDisplayName(family.people.get(id)!);
  const q = query.trim().toLowerCase();
  const shown = ids
    .filter((id) => !q || nameOf(id).toLowerCase().includes(q))
    .slice(0, LEAVES_SHOWN);

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [
          styles.fold,
          { borderColor: palette.border },
          pressed && { opacity: 0.8 },
        ]}
      >
        <Text style={[styles.foldText, { color: palette.foreground }]}>edit leaves</Text>
        <View style={open && styles.flipped}>
          <ChevronDownIcon color={palette.mutedForeground} size={18} />
        </View>
      </Pressable>
      {open ? (
        <View style={styles.leaves}>
          {ids.length > LEAVES_SHOWN ? (
            <TextField label="Find a leaf" value={query} onChangeText={setQuery} autoCorrect={false} />
          ) : null}
          {shown.map((id) => (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`Edit ${nameOf(id)}`}
              onPress={() => router.push({ pathname: "/edit/[id]", params: { id } })}
              style={({ pressed }) => [
                styles.leaf,
                { borderColor: palette.border },
                pressed && { opacity: 0.6 },
              ]}
            >
              <Text numberOfLines={1} style={[styles.leafName, { color: palette.foreground }]}>
                {nameOf(id)}
              </Text>
              <Text style={[styles.leafEdit, { color: palette.mutedForeground }]}>edit</Text>
            </Pressable>
          ))}
          {shown.length === 0 ? (
            <Text style={[styles.leavesNote, { color: palette.mutedForeground }]}>
              Nobody by that name.
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/**
 * What the phone notifies them of (Step 204): new messages, new stories
 * and (Step 217.4) birthday cards, each on until they turn it off, for every phone they're signed
 * in on. If the phone itself won't let the app notify them, they're sent
 * to its settings.
 */
function Notifications() {
  const palette = usePalette();
  const [settings, setSettings] = React.useState<PushSettings | null>(null);
  const [permission, setPermission] = React.useState<PushPermission | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let live = true;
    void pushPermission().then((p) => live && setPermission(p));
    readPushSettings()
      .then((s) => live && setSettings(s))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, []);

  const change = (next: PushSettings) => {
    const before = settings;
    setSettings(next);
    setFailed(false);
    savePushSettings(next).catch(() => {
      setSettings(before);
      setFailed(true);
    });
  };

  if (!settings) {
    return failed ? (
      <Text style={[styles.note, styles.section, { color: palette.mutedForeground }]}>
        Your notifications couldn&apos;t be read.
      </Text>
    ) : null;
  }
  const row = (label: string, key: keyof PushSettings) => (
    <View style={[styles.switchRow, { borderColor: palette.border }]}>
      <Text style={[styles.leafName, { color: palette.foreground }]}>{label}</Text>
      <Switch
        accessibilityLabel={label}
        value={settings[key]}
        onValueChange={(on) => change({ ...settings, [key]: on })}
        trackColor={{ true: palette.green }}
      />
    </View>
  );
  return (
    <View style={styles.section}>
      <Text style={[styles.leavesTitle, { color: palette.foreground }]}>Notifications</Text>
      {row("Messages", "messages")}
      {row("New stories", "stories")}
      {row("Birthday cards", "cards")}
      {permission === "denied" ? (
        <View style={styles.off}>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            Notifications are off for ancestree on this phone.
          </Text>
          <Button
            variant="outline"
            label="open phone settings"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : null}
      {failed ? (
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          Couldn&apos;t save that. Try again.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingBottom: 32 },
  who: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: GUTTER,
    paddingTop: 4,
  },
  face: { width: FACE, height: FACE, borderRadius: FACE / 2 },
  initials: { alignItems: "center", justifyContent: "center" },
  initialsText: { fontFamily: font.semibold, fontSize: 22, color: "#ffffff" },
  names: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.semibold, fontSize: 20 },
  email: { fontFamily: font.regular, fontSize: 15 },
  fold: {
    minHeight: 48,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  foldText: { fontFamily: font.medium, fontSize: 16 },
  flipped: { transform: [{ rotate: "180deg" }] },
  leaves: { marginTop: 10, gap: 4 },
  leavesTitle: { fontFamily: font.medium, fontSize: 14, marginBottom: 4 },
  leavesNote: { fontFamily: font.regular, fontSize: 15, paddingVertical: 8 },
  leaf: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leafName: { flex: 1, fontFamily: font.regular, fontSize: 17 },
  leafEdit: { fontFamily: font.medium, fontSize: 15 },
  section: { marginTop: 24, gap: 4, paddingHorizontal: GUTTER },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  note: { fontFamily: font.regular, fontSize: 15, paddingVertical: 8 },
  off: { gap: 4, alignItems: "flex-start" },
  actions: { marginTop: 24, gap: 10, paddingHorizontal: GUTTER },
  links: { marginTop: 12, alignItems: "flex-start", paddingHorizontal: GUTTER },
});
