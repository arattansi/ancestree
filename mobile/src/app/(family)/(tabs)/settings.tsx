import { router } from "expo-router";
import * as React from "react";
import { Image, Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { personDisplayName, personInitials } from "@/lib/person-name";
import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import { usePhotoUrl } from "@/family/photo";
import { font, GUTTER, usePalette } from "@/theme";
import { AppHeader, ScreenTitle } from "@/ui/app-header";
import { Button } from "@/ui/button";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";
const FACE = 64;

/**
 * The member and their settings, the right end of the menu bar (Step
 * 179.4): who's signed in, signing out, the privacy notice, message
 * security, and deleting the account (Step 176), which the App Store asks
 * every app with accounts for.
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
      <ScrollView contentContainerStyle={styles.body}>
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
              {session?.user.email}
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
  actions: { marginTop: 24, gap: 10, paddingHorizontal: GUTTER },
  links: { marginTop: 12, alignItems: "flex-start", paddingHorizontal: GUTTER },
});
