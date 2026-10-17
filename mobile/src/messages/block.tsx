import * as React from "react";
import { StyleSheet, View } from "react-native";

import { messenger } from "@/messages/store";
import { ErrorText, Words } from "@/messages/ui";
import { Button } from "@/ui/button";

/**
 * **block {first}**, asked once more before it's done (Step 177.3): neither
 * can write to the other until it's undone.
 */
export function BlockControl({ userId, first }: { userId: string; first: string }) {
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function blockThem() {
    setBusy(true);
    setError(null);
    const done = await messenger.block(userId, true);
    setBusy(false);
    if (!done) setError("Couldn't block them. Try again.");
  }

  return (
    <View style={styles.block}>
      {confirming ? (
        <>
          <Words>Block {first}? Neither of you can write to the other until you unblock.</Words>
          <View style={styles.choices}>
            <Button variant="destructive" label="block" busy={busy} onPress={() => void blockThem()} />
            <Button variant="outline" label="cancel" onPress={() => setConfirming(false)} />
          </View>
        </>
      ) : (
        <View style={styles.start}>
          <Button
            variant="outline"
            label={`block ${first}`}
            asWritten
            onPress={() => setConfirming(true)}
          />
        </View>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

/** Blocked: say so, with **unblock**. */
export function BlockedNote({ userId, first }: { userId: string; first: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <>
      <Words muted>You blocked {first}.</Words>
      <View style={styles.start}>
        <Button
          variant="outline"
          label="unblock"
          busy={busy}
          onPress={() => {
            setBusy(true);
            void messenger.block(userId, false).finally(() => setBusy(false));
          }}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  start: { alignItems: "flex-start" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  block: { gap: 10 },
});
