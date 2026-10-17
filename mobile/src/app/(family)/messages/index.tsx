import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  badgeCount,
  isMuted,
  onItsWayText,
  shortWhen,
  unreadText,
  type ConversationSummary,
} from "@/lib/messenger";
import { linkFragment, messenger, useMessenger } from "@/messages/store";
import { ErrorText, Face, Notice, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ScreenHeader, HeaderButton } from "@/ui/header";
import { BellOffIcon, LockKeyholeIcon, SquarePenIcon } from "@/ui/icons";
import { TextField } from "@/ui/text-field";

/**
 * Your conversations (Step 179.1), as the web's pop-up lists them: the
 * newest first, unread in bold with a count, muted ones with a crossed
 * bell. Locked when the member's key lives on another device.
 */
export default function Messages() {
  const palette = usePalette();
  const keys = useMessenger((s) => s.keys);
  const data = useMessenger((s) => s.data);
  const failed = useMessenger((s) => s.failed);
  const me = useMessenger((s) => s.me);

  React.useEffect(() => {
    if (keys !== "waiting") void messenger.loadList();
  }, [keys]);

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title="Messages">
        {keys === "ready" ? (
          <HeaderButton label="Message security" onPress={() => router.push("/messages/security")}>
            <LockKeyholeIcon color={palette.foreground} />
          </HeaderButton>
        ) : null}
        {keys === "ready" && data && data.contacts.length > 0 ? (
          <HeaderButton label="New message" onPress={() => router.push("/messages/new")}>
            <SquarePenIcon color={palette.foreground} />
          </HeaderButton>
        ) : null}
      </ScreenHeader>
      {keys === "locked" ? (
        <Locked />
      ) : keys === "unavailable" ? (
        <Notice>
          <Words muted center>
            Messages couldn&rsquo;t be opened on this phone.
          </Words>
          <Button label="try again" onPress={messenger.retryKeys} />
        </Notice>
      ) : !data ? (
        failed ? (
          <Notice>
            <Words muted center>
              Couldn&rsquo;t load your messages.
            </Words>
            <Button label="try again" onPress={() => void messenger.loadList()} />
          </Notice>
        ) : (
          <View style={styles.centre}>
            <ActivityIndicator color={palette.mutedForeground} />
          </View>
        )
      ) : data.conversations.length === 0 ? (
        <Notice>
          <Words muted center>
            {data.contacts.length > 0 ? "No messages yet." : "No one else is on your trees yet."}
          </Words>
          {data.contacts.length > 0 ? (
            <Button label="new message" onPress={() => router.push("/messages/new")} />
          ) : null}
        </Notice>
      ) : (
        <FlatList
          data={data.conversations}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => <ConversationRow conversation={item} me={me} />}
        />
      )}
    </SafeAreaView>
  );
}

function ConversationRow({ conversation: c, me }: { conversation: ConversationSummary; me: string | null }) {
  const palette = usePalette();
  const unread = c.unread > 0;
  const muted = isMuted(c);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={unread ? `${c.name}, ${c.unread} unread` : c.name}
      onPress={() => router.push({ pathname: "/messages/[id]", params: { id: c.id } })}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: palette.muted }]}
    >
      <Face name={c.name} />
      <View style={styles.rowText}>
        <View style={styles.rowLine}>
          <Text
            numberOfLines={1}
            style={[
              styles.name,
              { color: palette.foreground, fontFamily: unread ? font.semibold : font.medium },
            ]}
          >
            {c.name}
          </Text>
          {muted ? <BellOffIcon size={14} color={palette.mutedForeground} /> : null}
          {c.lastAt ? (
            <Text style={[styles.when, { color: palette.mutedForeground }]}>{shortWhen(c.lastAt)}</Text>
          ) : null}
        </View>
        <View style={styles.rowLine}>
          <Text
            numberOfLines={1}
            style={[styles.last, { color: unread ? palette.foreground : palette.mutedForeground }]}
          >
            {!c.lastAt && c.incomingWaiting > 0 ? (
              // Nothing reached the member yet (Step 182).
              <Text style={{ fontStyle: "italic" }}>{onItsWayText(c.incomingWaiting)}</Text>
            ) : (
              <>
                {c.lastSenderId === me ? "You: " : ""}
                {c.lastStatus ? (
                  <Text style={{ fontStyle: "italic" }}>{unreadText(c.lastStatus)}</Text>
                ) : (
                  c.lastBody
                )}
              </>
            )}
          </Text>
          {unread ? (
            <View
              style={[
                styles.count,
                // Muted: counted here, but not on the badge (Step 177.4).
                { backgroundColor: muted ? palette.mutedForeground : palette.destructiveSolid },
              ]}
            >
              <Text style={styles.countText}>{badgeCount(c.unread)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

/**
 * The member's key lives on another device, or changed there: link this
 * phone from it (scan its code, or paste its link), open it with the
 * recovery phrase, or start over.
 */
function Locked() {
  const palette = usePalette();
  const backup = useMessenger((s) => s.backupVersion != null && s.backupVersion === s.keyVersion);
  const [mode, setMode] = React.useState<"choose" | "paste" | "phrase" | "start-over">("choose");
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const problem = await task();
    setBusy(false);
    if (problem) setError(problem);
  }

  function show(next: typeof mode) {
    setMode(next);
    setText("");
    setError(null);
  }

  return (
    <Notice>
      <LockKeyholeIcon color={palette.mutedForeground} />
      <Words strong center>
        Your messages are locked on this phone.
      </Words>
      {mode === "choose" ? (
        <>
          <Words muted center>
            On a device you&rsquo;ve used before, open messages, choose the lock, then link a device.
            Scan its code here.
          </Words>
          <View style={styles.choices}>
            <Button label="scan the code" onPress={() => router.push("/messages/scan")} />
            <Button variant="outline" label="paste the link" onPress={() => show("paste")} />
            {backup ? (
              <Button variant="outline" label="use recovery phrase" onPress={() => show("phrase")} />
            ) : null}
          </View>
          <Button variant="link" label="Lost every device? Start over" onPress={() => show("start-over")} />
        </>
      ) : mode === "paste" || mode === "phrase" ? (
        <View style={styles.form}>
          <TextField
            label={mode === "paste" ? "The link" : "Your 12 words"}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            autoComplete="off"
            style={styles.area}
          />
          <Button
            label={mode === "paste" ? "link this phone" : "unlock"}
            busy={busy}
            onPress={() =>
              void run(async () => {
                if (mode === "phrase") return messenger.useRecoveryPhrase(text);
                const fragment = linkFragment(text);
                return fragment
                  ? messenger.takeDeviceLink(fragment)
                  : "That isn't a link to this. Copy it again from your other device.";
              })
            }
          />
          <Button variant="outline" label="back" onPress={() => show("choose")} />
        </View>
      ) : (
        <View style={styles.form}>
          <Words muted center>
            Start over? Earlier messages can&rsquo;t be read here, and your family will see your
            security code changed.
          </Words>
          <Button
            variant="destructive"
            label="start over"
            busy={busy}
            onPress={() => void run(messenger.startOver)}
          />
          <Button variant="outline" label="cancel" onPress={() => show("choose")} />
        </View>
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </Notice>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  list: { paddingVertical: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingVertical: 10,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowLine: { flexDirection: "row", alignItems: "center", gap: 8 },
  name: { flexShrink: 1, fontSize: 16 },
  when: { marginLeft: "auto", fontFamily: font.regular, fontSize: 13 },
  last: { flex: 1, fontFamily: font.regular, fontSize: 15 },
  count: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { color: "#ffffff", fontFamily: font.semibold, fontSize: 11, fontVariant: ["tabular-nums"] },
  choices: { alignSelf: "stretch", gap: 10 },
  form: { alignSelf: "stretch", gap: 10 },
  area: { minHeight: 96, paddingTop: 12, textAlignVertical: "top" },
});
