import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";

import {
  everyTreeHandedOver,
  loneTrees,
  type SoleRootTree,
} from "@/lib/account-deletion";
import { deleteAccount, loadSoleRootTrees } from "@/auth/delete-account";
import { useSession } from "@/auth/session";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";

/**
 * Delete your account (Step 176), as the web's account page asks it: who
 * takes over each tree you're the only Root of, a tree nobody else is on
 * named as going too, then for good. Signed out once it's gone.
 */
export default function DeleteAccountScreen() {
  const palette = usePalette();
  const { session } = useSession();
  const userId = session?.user.id ?? null;
  const [trees, setTrees] = React.useState<SoleRootTree[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [successors, setSuccessors] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    if (!userId) return;
    let live = true;
    loadSoleRootTrees(userId).then(
      (found) => {
        if (live) setTrees(found);
      },
      (e: Error) => {
        if (live) setLoadError(e.message);
      },
    );
    return () => {
      live = false;
    };
  }, [userId, attempt]);

  async function onDelete() {
    if (!trees) return;
    setBusy(true);
    setError(null);
    try {
      // Signed out on success: the root layout swaps in the sign-in screen.
      await deleteAccount({
        successors,
        deleteTrees: loneTrees(trees).map((t) => t.treeId),
      });
    } catch (e) {
      setBusy(false);
      setError(e instanceof Error ? e.message : "Couldn’t delete your account. Try again.");
    }
  }

  if (loadError) {
    return (
      <View style={styles.body}>
        <Text style={[styles.text, { color: palette.foreground }]}>{loadError}</Text>
        <Button
          label="try again"
          onPress={() => {
            setLoadError(null);
            setAttempt((n) => n + 1);
          }}
        />
      </View>
    );
  }
  if (!trees) {
    return (
      <View style={[styles.body, styles.centre]}>
        <ActivityIndicator color={palette.green} />
      </View>
    );
  }

  const lone = loneTrees(trees);
  const handingOver = trees.length > lone.length;
  const lead = handingOver
    ? "You’re the only Root of a tree, so choose who takes over. They become a Root and own everything you added there."
    : lone.length > 0
      ? "This removes your sign-in and profile."
      : "This removes your sign-in and profile from every tree. Everything you added stays, managed by a Root.";

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.title, { color: palette.foreground }]}>
        Delete your account?
      </Text>
      <Text style={[styles.text, { color: palette.foreground }]}>{lead}</Text>
      <Text style={[styles.text, { color: palette.foreground }]}>
        This cannot be undone.
      </Text>

      {trees.map((t) =>
        t.successors.length > 0 ? (
          <View key={t.treeId} style={styles.tree}>
            <Text style={[styles.label, { color: palette.foreground }]}>
              Who takes over {t.treeName}?
            </Text>
            <View style={styles.chips}>
              {t.successors.map((s) => (
                <Chip
                  key={s.userId}
                  label={s.name}
                  on={successors[t.treeId] === s.userId}
                  onPress={() =>
                    setSuccessors((prev) => ({ ...prev, [t.treeId]: s.userId }))
                  }
                />
              ))}
            </View>
          </View>
        ) : (
          <Text key={t.treeId} style={[styles.text, { color: palette.mutedForeground }]}>
            Nobody else is on {t.treeName}, so it’s deleted too, with everything on
            it that no other tree shows.
          </Text>
        ),
      )}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.text, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <Button
          variant="destructive"
          label={handingOver ? "hand over and delete" : "delete permanently"}
          busy={busy}
          disabled={!everyTreeHandedOver(trees, successors)}
          onPress={() => void onDelete()}
        />
        <Button
          variant="outline"
          label="keep my account"
          disabled={busy}
          onPress={() => router.back()}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: GUTTER + 8, paddingTop: 28, gap: 12 },
  centre: { alignItems: "center", paddingTop: 48 },
  title: { fontFamily: font.semibold, fontSize: 22 },
  text: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  tree: { gap: 8, marginTop: 8 },
  label: { fontFamily: font.medium, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  actions: { gap: 10, marginTop: 16 },
});
