import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { REPORT_REASON_MAX } from "@/lib/messenger";
import { BlockControl } from "@/messages/block";
import { messenger, useMessenger } from "@/messages/store";
import { ErrorText, firstOf, usePeer, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/header";
import { TextField } from "@/ui/text-field";

/**
 * Report one of their messages (Step 177.3): its words, as this phone read
 * them, go to the Roots of the trees you share and ancestree's reviewers,
 * who see nothing else of the conversation. Then the offer to block them.
 */
export default function Report() {
  const { id, message: messageId } = useLocalSearchParams<{ id: string; message: string }>();
  const palette = usePalette();
  const peer = usePeer(id);
  const message = useMessenger((s) => s.threads[id]?.messages.find((m) => m.id === messageId));
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);
  const first = firstOf(peer?.name, "them");

  async function send() {
    if (!message) return;
    setBusy(true);
    setError(null);
    const problem = await messenger.report(message.id, message.body, reason);
    setBusy(false);
    if (problem) setError(problem);
    else setSent(true);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title="Report a Message" />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        {!message ? (
          <Words muted>That message is gone.</Words>
        ) : sent ? (
          <>
            <Words strong>Reported. A Root will look at it.</Words>
            {peer?.blocked === "by_you" ? (
              <Words muted>You blocked {first}.</Words>
            ) : peer?.userId ? (
              <BlockControl userId={peer.userId} first={first} />
            ) : null}
            <View style={styles.start}>
              <Button variant="outline" label="done" onPress={() => router.back()} />
            </View>
          </>
        ) : (
          <>
            <View style={[styles.quote, { backgroundColor: palette.muted }]}>
              <Text selectable style={[styles.quoteText, { color: palette.foreground }]}>
                {message.body}
              </Text>
            </View>
            <Words muted>
              The Roots of trees you share with {first}, and ancestree&rsquo;s reviewers, see this
              message and who sent it, nothing else.
            </Words>
            <TextField
              label="What’s wrong (optional)"
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={REPORT_REASON_MAX}
              style={styles.area}
            />
            <View style={styles.row}>
              <Button label="report" busy={busy} onPress={() => void send()} />
              <Button variant="outline" label="cancel" onPress={() => router.back()} />
            </View>
            {error ? <ErrorText>{error}</ErrorText> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: GUTTER, gap: 16 },
  quote: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  quoteText: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  area: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
  row: { flexDirection: "row", gap: 10 },
  start: { alignItems: "flex-start" },
});
