import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { isMuted, mutedText, MUTE_CHOICES } from "@/lib/messenger";
import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { useRelations } from "@/messages/relations";
import { BlockControl, BlockedNote } from "@/messages/block";
import { messenger, useMessenger } from "@/messages/store";
import { ErrorText, Face, firstOf, Section, usePeer, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ScreenHeader } from "@/ui/header";

/**
 * A conversation's details (Step 177 on the web): who they are to you and
 * how you're connected, mute it, check their security code, block them.
 */
export default function Details() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const peer = usePeer(id);
  const relations = useRelations();
  const { walkTo, state } = useFamily();
  const trees = useMessenger((s) =>
    peer?.userId ? s.data?.contacts.find((c) => c.userId === peer.userId)?.trees : undefined,
  );
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const name = peer?.name ?? "";
  const first = firstOf(name, "them");
  const muted = peer?.mutedUntil && isMuted(peer) ? peer.mutedUntil : null;
  const relation = peer?.userId ? relations.get(peer.userId) : undefined;
  const people = state.status === "ready" ? state.family.people : null;
  const onTree = !!peer?.personId && !!people?.has(peer.personId);
  const faceName = (personId: string) => {
    const person = people?.get(personId);
    return person ? personDisplayName(person) : "?";
  };

  async function mute(hours: number | null | "unmute") {
    setBusy(true);
    setError(null);
    const done = await messenger.mute(id, hours);
    setBusy(false);
    if (!done) setError("Couldn't change that. Try again.");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title={name} />
      <ScrollView contentContainerStyle={styles.body}>
        {peer ? (
          <View style={styles.who}>
            <Face name={name} size={64} />
            <Text style={[styles.name, { color: palette.foreground }]}>{name}</Text>
            {relation ? <Words center>{relation.label}</Words> : null}
            {trees?.length ? (
              <Words muted center>
                On {trees.join(" · ")}
              </Words>
            ) : null}
          </View>
        ) : null}

        {relation ? (
          <Section title="How You’re Connected">
            <View>
              {relation.chain.map((link, i) => (
                <View key={link.personId} style={styles.link}>
                  <View style={styles.linkFace}>
                    {i > 0 ? <View style={[styles.stem, { backgroundColor: palette.border }]} /> : null}
                    <Face name={faceName(link.personId)} size={32} />
                  </View>
                  <Text
                    style={[
                      styles.says,
                      { color: i === 0 ? palette.mutedForeground : palette.foreground },
                      i > 0 && { paddingTop: 8 },
                    ]}
                  >
                    {link.says.charAt(0).toUpperCase() + link.says.slice(1)}
                  </Text>
                </View>
              ))}
            </View>
            {onTree && peer?.personId ? (
              <View style={styles.start}>
                <Button
                  variant="outline"
                  label="see on the tree"
                  onPress={() => {
                    walkTo(peer.personId!);
                    router.dismissTo("/");
                  }}
                />
              </View>
            ) : null}
          </Section>
        ) : null}

        <Section title="Mute">
          {muted ? (
            <>
              <Words muted>{mutedText(muted)}</Words>
              <View style={styles.start}>
                <Button variant="outline" label="unmute" busy={busy} onPress={() => void mute("unmute")} />
              </View>
            </>
          ) : (
            <>
              <Words muted>No badge for new messages.</Words>
              <View style={styles.choices}>
                {MUTE_CHOICES.map((choice) => (
                  <Button
                    key={choice.label}
                    variant="outline"
                    label={choice.label}
                    disabled={busy || !peer}
                    onPress={() => void mute(choice.hours)}
                  />
                ))}
              </View>
            </>
          )}
        </Section>

        {peer?.keyVersion != null ? (
          <Section title="Security Code">
            <Words muted>Check that your messages reach only {first}.</Words>
            <View style={styles.start}>
              <Button
                variant="outline"
                label="verify"
                onPress={() => router.push({ pathname: "/messages/[id]/verify", params: { id } })}
              />
            </View>
          </Section>
        ) : null}

        {peer?.userId ? (
          <Section title="Block">
            {peer.blocked === "by_you" ? (
              <BlockedNote userId={peer.userId} first={first} />
            ) : (
              <BlockControl userId={peer.userId} first={first} />
            )}
          </Section>
        ) : null}

        {error ? <ErrorText>{error}</ErrorText> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { padding: GUTTER, paddingBottom: 40, gap: 28 },
  who: { alignItems: "center", gap: 6 },
  name: { fontFamily: font.semibold, fontSize: 20, textAlign: "center" },
  link: { flexDirection: "row", alignItems: "center", gap: 10 },
  linkFace: { width: 36, alignItems: "center" },
  stem: { width: StyleSheet.hairlineWidth * 2, height: 8 },
  says: { flex: 1, fontFamily: font.regular, fontSize: 16 },
  start: { alignItems: "flex-start" },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
