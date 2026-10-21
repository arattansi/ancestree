import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import * as React from "react";
import { Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import { encode as encodeQr } from "uqr";

import { messenger, useMessenger } from "@/messages/store";
import { ErrorText, Section, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/header";

/**
 * Message Security (Step 174.6 on the web): link another device to this
 * phone's messages, the recovery phrase, whom you've blocked, and your
 * conversations as a text file read on this phone.
 */
export default function Security() {
  const palette = usePalette();
  const backup = useMessenger((s) => s.backupVersion != null && s.backupVersion === s.keyVersion);
  const blocks = useMessenger((s) => s.blocks);
  const [link, setLink] = React.useState<string | null>(null);
  const [phrase, setPhrase] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"link" | "phrase" | "export" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    messenger.loadBlocks();
  }, []);

  async function makeLink() {
    setBusy("link");
    setError(null);
    const made = await messenger.makeDeviceLink();
    setBusy(null);
    if (made) setLink(made);
    else setError("Couldn't make a link. Try again.");
  }

  async function makePhrase() {
    setBusy("phrase");
    setError(null);
    const made = await messenger.makeRecoveryPhrase();
    setBusy(null);
    if (made) setPhrase(made);
    else setError("Couldn't set a recovery phrase. Try again.");
  }

  // Read here and handed over as a file: the server can't (Step 177.6).
  async function exportAll() {
    setBusy("export");
    setError(null);
    const made = await messenger.exportConversations();
    if (!made) {
      setBusy(null);
      setError("Couldn't export your messages. Try again.");
      return;
    }
    try {
      if (Platform.OS === "web") {
        await Share.share({ message: made.text });
      } else {
        const file = new File(Paths.cache, made.filename);
        file.create({ overwrite: true });
        file.write(made.text);
        try {
          // Android's Share takes words only, not a file (Step 198).
          if (Platform.OS === "android") {
            await Sharing.shareAsync(file.uri, { mimeType: "text/plain", dialogTitle: made.filename });
          } else {
            await Share.share({ url: file.uri });
          }
        } finally {
          // The words, readable, leave no copy behind once handed over.
          file.delete();
        }
      }
    } catch {
      setError("Couldn't export your messages. Try again.");
    }
    setBusy(null);
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title="Message Security" />
      <ScrollView contentContainerStyle={styles.body}>
        <Words muted>Your messages are locked to your devices. Ancestree can&rsquo;t read them.</Words>

        <Section title="Link a Device">
          {link ? (
            <View style={styles.linked}>
              <QrCode text={link} />
              <Words muted center>
                Scan with your other device&rsquo;s camera, or open the link there. It works once,
                for 10 minutes.
              </Words>
              <Button
                variant="outline"
                label="share link"
                onPress={() => void Share.share({ message: link })}
              />
            </View>
          ) : (
            <>
              <Words muted>Read your messages on another device too.</Words>
              <View style={styles.start}>
                <Button
                  variant="outline"
                  label="link a device"
                  busy={busy === "link"}
                  disabled={!!busy}
                  onPress={() => void makeLink()}
                />
              </View>
            </>
          )}
        </Section>

        <Section title="Recovery Phrase">
          {phrase ? (
            <>
              <View style={[styles.words, { borderColor: palette.border }]}>
                {phrase.split(" ").map((word, i) => (
                  <Text key={i} style={[styles.word, { color: palette.foreground }]}>
                    <Text style={{ color: palette.mutedForeground }}>{i + 1}.</Text> {word}
                  </Text>
                ))}
              </View>
              <Words muted>
                Write these down and keep them safe. Anyone with them can read your messages.
              </Words>
              <View style={styles.start}>
                <Button label="done" onPress={() => setPhrase(null)} />
              </View>
            </>
          ) : (
            <>
              <Words muted>
                {backup
                  ? "Set. A new phrase replaces it."
                  : "Lose every device and 12 words still unlock your messages."}
              </Words>
              <View style={styles.start}>
                <Button
                  variant="outline"
                  label={backup ? "make a new phrase" : "set a recovery phrase"}
                  busy={busy === "phrase"}
                  disabled={!!busy}
                  onPress={() => void makePhrase()}
                />
              </View>
            </>
          )}
        </Section>

        {blocks?.length ? (
          <Section title="Blocked">
            {blocks.map((b) => (
              <View key={b.userId} style={styles.blocked}>
                <Text numberOfLines={1} style={[styles.blockedName, { color: palette.foreground }]}>
                  {b.name}
                </Text>
                <UnblockButton userId={b.userId} />
              </View>
            ))}
          </Section>
        ) : null}

        <Section title="Export Messages">
          <Words muted>Your conversations as a text file, read on this phone.</Words>
          <View style={styles.start}>
            <Button
              variant="outline"
              label="export"
              busy={busy === "export"}
              disabled={!!busy}
              onPress={() => void exportAll()}
            />
          </View>
        </Section>

        {error ? <ErrorText>{error}</ErrorText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

/** A QR code, drawn as one path on white, as the web draws it. */
function QrCode({ text }: { text: string }) {
  const { size, data } = React.useMemo(() => encodeQr(text, { ecc: "M", border: 2 }), [text]);
  const d = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="Code to link a device">
      <Svg width={208} height={208} viewBox={`0 0 ${size} ${size}`}>
        <Rect x={0} y={0} width={size} height={size} fill="#ffffff" rx={1} />
        <Path d={d} fill="#000000" />
      </Svg>
    </View>
  );
}

function UnblockButton({ userId }: { userId: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      variant="outline"
      label="unblock"
      busy={busy}
      onPress={() => {
        setBusy(true);
        void messenger.block(userId, false).finally(() => setBusy(false));
      }}
    />
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: GUTTER, paddingBottom: 40, gap: 28 },
  linked: { alignItems: "center", gap: 12 },
  start: { alignItems: "flex-start" },
  words: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    rowGap: 6,
  },
  word: { width: "33.33%", fontFamily: "Menlo", fontSize: 14 },
  blocked: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  blockedName: { flex: 1, fontFamily: font.regular, fontSize: 16 },
});
