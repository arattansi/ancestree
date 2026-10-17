import { router } from "expo-router";
import * as React from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/**
 * Who's signed in: signing out, the privacy notice, and deleting the
 * account (Step 176), which the App Store asks every app with accounts for.
 */
export default function Account() {
  const palette = usePalette();
  const { session, signOut } = useSession();
  const { state } = useFamily();
  const name = state.status === "ready" ? state.family.displayName : null;

  return (
    <View style={styles.body}>
      {name ? (
        <Text style={[styles.name, { color: palette.foreground }]}>{name}</Text>
      ) : null}
      <Text style={[styles.email, { color: palette.mutedForeground }]}>
        {session?.user.email}
      </Text>
      <View style={styles.actions}>
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
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: GUTTER + 8, paddingTop: 28, gap: 4 },
  name: { fontFamily: font.semibold, fontSize: 22 },
  email: { fontFamily: font.regular, fontSize: 16 },
  actions: { marginTop: 24, gap: 10 },
  links: { marginTop: 12, alignItems: "flex-start" },
});
