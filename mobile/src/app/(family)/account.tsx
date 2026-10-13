import * as React from "react";
import { StyleSheet, Text, View } from "react-native";

import { useSession } from "@/auth/session";
import { useFamily } from "@/family/family";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";

/** Who's signed in, and signing out. Account deletion joins it before release. */
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: GUTTER + 8, paddingTop: 28, gap: 4 },
  name: { fontFamily: font.semibold, fontSize: 22 },
  email: { fontFamily: font.regular, fontSize: 16 },
  actions: { marginTop: 24 },
});
