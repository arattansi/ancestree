import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { messenger, useMessenger } from "@/messages/store";
import { firstOf, Notice, usePeer, Words } from "@/messages/ui";
import { font, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/header";
import { ShieldCheckIcon } from "@/ui/icons";

/**
 * A conversation's safety code (Step 174.6), to compare with the other
 * member in person or on a call: the same 60 digits on both screens mean
 * neither key was swapped on the way.
 */
export default function Verify() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const peer = usePeer(id);
  const otherId = peer?.userId ?? null;
  const verified = useMessenger((s) => (otherId ? s.verified[otherId] : undefined));
  const [code, setCode] = React.useState<{ code: string[]; key: string } | null | "none">(null);

  React.useEffect(() => {
    if (!otherId) return;
    let live = true;
    void messenger.codeFor(otherId).then((c) => {
      if (live) setCode(c ?? "none");
    });
    return () => {
      live = false;
    };
  }, [otherId]);

  const name = peer?.name ?? "";
  const first = firstOf(name, "them");
  const isVerified = code && code !== "none" && verified === code.key;
  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title={`Verify ${name}`} />
      <Notice>
        {code === null ? (
          <ActivityIndicator color={palette.mutedForeground} />
        ) : code === "none" ? (
          <Words muted center>
            {first} gets a security code once they next visit ancestree.
          </Words>
        ) : (
          <>
            <Words muted center>
              Compare these numbers with {first}, in person or on a call. If they match, your messages
              reach only {first}.
            </Words>
            <View accessibilityLabel="Safety code" style={styles.grid}>
              {code.code.map((group, i) => (
                <Text key={i} style={[styles.group, { color: palette.foreground }]}>
                  {group}
                </Text>
              ))}
            </View>
            {isVerified ? (
              <View style={styles.verified}>
                <View style={styles.verifiedLine}>
                  <ShieldCheckIcon size={18} color={palette.foreground} />
                  <Text style={[styles.verifiedText, { color: palette.foreground }]}>Verified</Text>
                </View>
                <Button
                  variant="link"
                  label="Clear"
                  onPress={() => otherId && void messenger.setVerified(otherId, null)}
                />
              </View>
            ) : (
              <Button
                variant="outline"
                label="they match"
                onPress={() => otherId && void messenger.setVerified(otherId, code.key)}
              />
            )}
          </>
        )}
      </Notice>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    columnGap: 16,
    rowGap: 10,
    maxWidth: 300,
  },
  group: { width: 60, textAlign: "center", fontFamily: "Menlo", fontSize: 17, fontVariant: ["tabular-nums"] },
  verified: { alignItems: "center", gap: 2 },
  verifiedLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  verifiedText: { fontFamily: font.medium, fontSize: 16 },
});
