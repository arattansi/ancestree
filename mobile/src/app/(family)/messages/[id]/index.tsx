import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

import {
  clockTime,
  dayLabel,
  isMuted,
  MESSAGE_MAX,
  incomingWaitingText,
  newDay,
  unreadText,
  waitingText,
  type ChatMessage,
} from "@/lib/messenger";
import { aboutLine, useRelations } from "@/messages/relations";
import { messenger, useMessenger } from "@/messages/store";
import { ErrorText, Face, firstOf, usePeer, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { HeaderButton, ScreenHeader } from "@/ui/header";
import { BellOffIcon, EllipsisIcon, LockKeyholeIcon, SendIcon, ShieldCheckIcon } from "@/ui/icons";

/** Messages from one person within five minutes sit close together. */
const RUN_MS = 5 * 60 * 1000;

/**
 * A conversation (Step 179.1), as the web's thread: the newest at the
 * bottom, days marked, a changed security code said where it happened;
 * tap a message for its time, and to delete your own or report theirs.
 * Who they are to you is under their name; their name opens the details.
 */
export default function ThreadScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const peer = usePeer(id);
  const thread = useMessenger((s) => s.threads[id]);
  const me = useMessenger((s) => s.me);
  const sendError = useMessenger((s) => s.sendError[id]);
  const relations = useRelations();
  const trees = useMessenger((s) =>
    peer?.userId ? s.data?.contacts.find((c) => c.userId === peer.userId)?.trees : undefined,
  );
  const verifiedKey = useMessenger((s) => (peer?.userId ? s.verified[peer.userId] : undefined));
  const currentKey = useMessenger((s) => (peer?.userId ? s.keyIds[peer.userId] : undefined));
  const [selected, setSelected] = React.useState<string | null>(null);
  const [keyboard, setKeyboard] = React.useState(false);

  // On screen: read each time it shows, and new messages count as read.
  useFocusEffect(
    React.useCallback(() => {
      messenger.focus(id);
      return () => messenger.focus(null);
    }, [id]),
  );

  React.useEffect(() => {
    // Android has no "will" events, only "did" (Step 198).
    const when = Platform.OS === "ios" ? "Will" : "Did";
    const shown = Keyboard.addListener(`keyboard${when}Show`, () => setKeyboard(true));
    const hidden = Keyboard.addListener(`keyboard${when}Hide`, () => setKeyboard(false));
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, []);

  const messages = React.useMemo(() => thread?.messages ?? [], [thread?.messages]);
  // Newest first, for a list drawn from the bottom up.
  const newestFirst = React.useMemo(() => [...messages].reverse(), [messages]);
  const name = peer?.name ?? "";
  const first = firstOf(name, "They");
  const about = aboutLine(peer?.userId ? relations.get(peer.userId) : undefined, trees);
  // Checked before, and their key has changed since (Step 174.6): nothing
  // more goes to them until it's checked again.
  const codeChanged = !!verifiedKey && !!currentKey && verifiedKey !== currentKey;
  // Whether there's a box to write in: the foot says why when there isn't.
  // Someone with no key yet can be written to: it waits for them (Step 182).
  const canWrite = !!peer && !peer.blocked && peer.canSend && !codeChanged;
  // The newest of the member's still waiting says so (Step 182).
  const lastWaiting = newestFirst.find((m) => m.waiting)?.id;
  // Theirs, written before the member had a key, come once they're next on.
  const onItsWay = peer?.incomingWaiting ? (
    <Text style={[styles.note, { color: palette.mutedForeground }]}>
      {incomingWaitingText(first, peer.incomingWaiting)}
    </Text>
  ) : null;
  const details = () => router.push({ pathname: "/messages/[id]/details", params: { id } });
  const verify = () => router.push({ pathname: "/messages/[id]/verify", params: { id } });

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader
        title={
          peer ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${name}, details`}
              onPress={details}
              style={({ pressed }) => [styles.who, pressed && { opacity: 0.6 }]}
            >
              <Face name={name} size={32} />
              <View style={styles.whoText}>
                <View style={styles.whoLine}>
                  <Text numberOfLines={1} style={[styles.whoName, { color: palette.foreground }]}>
                    {name}
                  </Text>
                  {verifiedKey && !codeChanged ? (
                    <ShieldCheckIcon size={16} color={palette.mutedForeground} />
                  ) : null}
                  {peer.mutedUntil && isMuted(peer) ? (
                    <BellOffIcon size={14} color={palette.mutedForeground} />
                  ) : null}
                </View>
                {/* Who they are to you (Step 177.1); the chain is in the details. */}
                {about ? (
                  <Text numberOfLines={1} style={[styles.about, { color: palette.mutedForeground }]}>
                    {about}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          ) : null
        }
      >
        {peer?.keyVersion != null ? (
          <HeaderButton label={`Verify ${name}`} onPress={verify}>
            <LockKeyholeIcon color={palette.foreground} />
          </HeaderButton>
        ) : null}
        {peer ? (
          <HeaderButton label={`About ${name}`} onPress={details}>
            <EllipsisIcon color={palette.foreground} />
          </HeaderButton>
        ) : null}
      </ScreenHeader>
      {codeChanged ? (
        <Pressable
          accessibilityRole="button"
          onPress={verify}
          style={[styles.banner, { backgroundColor: palette.attentionWash, borderBottomColor: palette.border }]}
        >
          <Text style={[styles.bannerText, { color: palette.foreground }]}>
            {first}&rsquo;s security code changed.{" "}
            <Text style={styles.bannerLink}>Verify again</Text>
          </Text>
        </Pressable>
      ) : null}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
      >
        {!thread || (thread.loading && messages.length === 0) ? (
          <View style={styles.centre}>
            <ActivityIndicator color={palette.mutedForeground} />
          </View>
        ) : thread.failed && messages.length === 0 ? (
          <View style={styles.centre}>
            <Words muted>Couldn&rsquo;t load your messages.</Words>
            <Button variant="link" label="Try again" onPress={() => messenger.retryThread(id)} />
          </View>
        ) : messages.length === 0 ? (
          <Pressable style={styles.centre} onPress={Keyboard.dismiss}>
            {onItsWay ?? (canWrite ? (
              <Words muted center>
                {peer?.keyVersion == null
                  ? `What you write waits until ${first} next visits ancestree.`
                  : `Say hello to ${firstOf(name, "them")}.`}
              </Words>
            ) : null)}
          </Pressable>
        ) : (
          <FlatList
            inverted
            data={newestFirst}
            keyExtractor={(m) => m.id}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.list}
            accessibilityLabel={`Messages with ${name}`}
            // Inverted: the header sits below the newest message.
            ListHeaderComponent={onItsWay}
            ListFooterComponent={
              thread.more ? (
                <View style={styles.older}>
                  <Button
                    variant="link"
                    label="Earlier messages"
                    disabled={thread.loading}
                    onPress={() => messenger.loadOlder(id)}
                  />
                </View>
              ) : null
            }
            renderItem={({ item, index }) => {
              const at = messages.length - 1 - index;
              return (
                <MessageItem
                  message={item}
                  previous={messages[at - 1]}
                  lastFromThem={lastFrom(messages, at, item.senderId)}
                  mine={item.senderId === me}
                  name={first}
                  note={item.id === lastWaiting && peer ? waitingText(first, peer) : undefined}
                  selected={selected === item.id}
                  onSelect={() => setSelected((now) => (now === item.id ? null : item.id))}
                />
              );
            }}
          />
        )}
        <View
          style={[
            styles.foot,
            { borderTopColor: palette.border, paddingBottom: keyboard ? 8 : Math.max(insets.bottom, 8) },
          ]}
        >
          {peer?.blocked === "by_you" && peer.userId ? (
            <Unblock userId={peer.userId} first={first} />
          ) : peer?.blocked === "by_them" ? (
            <Words muted center>
              You can&rsquo;t message {first}.
            </Words>
          ) : peer && !peer.canSend ? (
            <Words muted center>
              You no longer share a tree.
            </Words>
          ) : codeChanged ? (
            <Words muted center>
              Verify {first}&rsquo;s new security code to keep writing.
            </Words>
          ) : (
            <Composer id={id} error={sendError} disabled={!peer} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The message before `index` from the same sender, if any. */
function lastFrom(messages: readonly ChatMessage[], index: number, senderId: string) {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].senderId === senderId) return messages[i];
  }
  return undefined;
}

function MessageItem({
  message: m,
  previous,
  lastFromThem,
  mine,
  name,
  note,
  selected,
  onSelect,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  /** Their message before this one, to tell when their key changed. */
  lastFromThem: ChatMessage | undefined;
  mine: boolean;
  name: string;
  /** Under it: one of the member's still waiting for them (Step 182). */
  note?: string;
  /** Its actions show: delete your own (Step 177.5), report theirs (177.3). */
  selected: boolean;
  onSelect: () => void;
}) {
  const palette = usePalette();
  const dayBreak = newDay(previous?.createdAt, m.createdAt);
  const keyChanged =
    !mine && !!lastFromThem && lastFromThem.senderKeyVersion !== m.senderKeyVersion;
  const run =
    !dayBreak &&
    previous?.senderId === m.senderId &&
    Date.parse(m.createdAt) - Date.parse(previous.createdAt) < RUN_MS;
  // Your own messages can be deleted once they've gone; theirs reported,
  // once read here.
  const canAct = mine ? !m.pending : !m.status;
  return (
    <View style={[styles.item, { marginTop: run ? 2 : 10 }]}>
      {dayBreak ? (
        <Text style={[styles.day, { color: palette.mutedForeground }]}>{dayLabel(m.createdAt)}</Text>
      ) : null}
      {keyChanged ? (
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          {name}&rsquo;s security code changed.
        </Text>
      ) : null}
      <Pressable
        accessibilityRole={canAct ? "button" : undefined}
        accessibilityHint={canAct ? (mine ? "Shows its time and delete" : "Shows its time and report") : undefined}
        disabled={!canAct}
        onPress={onSelect}
        style={[
          styles.bubble,
          mine
            ? { alignSelf: "flex-end", backgroundColor: palette.primary }
            : { alignSelf: "flex-start", backgroundColor: palette.muted },
          m.pending && { opacity: 0.6 },
          m.status && { opacity: 0.7 },
          selected && { borderWidth: 2, borderColor: palette.mutedForeground },
        ]}
      >
        <Text
          selectable={!m.status}
          style={[
            styles.bubbleText,
            { color: mine ? palette.primaryForeground : palette.foreground },
            m.status && { fontStyle: "italic" },
          ]}
        >
          {m.status ? unreadText(m.status) : m.body}
        </Text>
      </Pressable>
      {note ? (
        <Text style={[styles.waiting, { color: palette.mutedForeground }]}>{note}</Text>
      ) : null}
      {selected ? <MessageActions message={m} mine={mine} onDone={onSelect} /> : null}
    </View>
  );
}

/**
 * A message's actions once it's tapped: its time, **delete** for your own
 * (Step 177.5), which deletes it for everyone once confirmed, and
 * **report** for theirs (Step 177.3).
 */
function MessageActions({
  message: m,
  mine,
  onDone,
}: {
  message: ChatMessage;
  mine: boolean;
  onDone: () => void;
}) {
  const palette = usePalette();
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function remove() {
    setBusy(true);
    setError(null);
    const problem = await messenger.deleteMessage(m.conversationId, m.id);
    setBusy(false);
    if (problem) setError(problem);
    else onDone();
  }

  return (
    <View style={[styles.actions, { alignSelf: mine ? "flex-end" : "flex-start" }]}>
      {confirming ? (
        <Text style={[styles.small, { color: palette.foreground }]}>Delete for everyone?</Text>
      ) : (
        <Text style={[styles.small, { color: palette.mutedForeground }]}>
          {dayLabel(m.createdAt)}, {clockTime(m.createdAt)}
        </Text>
      )}
      {mine ? (
        confirming ? (
          <>
            <SmallButton label="delete" danger busy={busy} onPress={() => void remove()} />
            <SmallButton label="cancel" onPress={() => setConfirming(false)} />
          </>
        ) : (
          <SmallButton label="delete" onPress={() => setConfirming(true)} />
        )
      ) : (
        <SmallButton
          label="report"
          onPress={() =>
            router.push({
              pathname: "/messages/[id]/report",
              params: { id: m.conversationId, message: m.id },
            })
          }
        />
      )}
      {error ? <ErrorText>{error}</ErrorText> : null}
    </View>
  );
}

function SmallButton({
  label,
  onPress,
  danger = false,
  busy = false,
}: {
  label: string;
  onPress: () => void;
  danger?: boolean;
  busy?: boolean;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy }}
      disabled={busy}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.smallButton,
        danger
          ? { backgroundColor: palette.destructiveSolid }
          : { borderColor: palette.border, borderWidth: StyleSheet.hairlineWidth * 2 },
        (pressed || busy) && { opacity: 0.7 },
      ]}
    >
      {busy ? (
        <ActivityIndicator size="small" color={danger ? "#ffffff" : palette.foreground} />
      ) : (
        <Text style={[styles.smallButtonText, { color: danger ? "#ffffff" : palette.foreground }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

function Composer({ id, error, disabled }: { id: string; error: string | undefined; disabled: boolean }) {
  const palette = usePalette();
  const [text, setText] = React.useState("");

  const submit = () => {
    if (!text.trim() || disabled) return;
    const body = text;
    setText("");
    void messenger.send(id, body).then((sent) => {
      // Not sent: the words come back to try again.
      if (!sent) setText((now) => now || body);
    });
  };

  return (
    <View style={styles.composer}>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <View style={styles.composeRow}>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          maxLength={MESSAGE_MAX}
          placeholder="Message"
          accessibilityLabel="Message"
          placeholderTextColor={palette.mutedForeground}
          editable={!disabled}
          style={[
            styles.field,
            { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.card },
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Send"
          accessibilityState={{ disabled: disabled || !text.trim() }}
          disabled={disabled || !text.trim()}
          onPress={submit}
          style={({ pressed }) => [
            styles.send,
            { backgroundColor: palette.primary },
            (disabled || !text.trim()) && { opacity: 0.4 },
            pressed && { opacity: 0.8 },
          ]}
        >
          <SendIcon size={20} color={palette.primaryForeground} />
        </Pressable>
      </View>
    </View>
  );
}

/** The foot once the member has blocked them: unblock to write again. */
function Unblock({ userId, first }: { userId: string; first: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <View style={styles.unblock}>
      <Words muted center>
        You blocked {first}.
      </Words>
      <Button
        variant="link"
        label="Unblock"
        disabled={busy}
        onPress={() => {
          setBusy(true);
          void messenger.block(userId, false).finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", gap: 4, padding: GUTTER },
  who: { flex: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 8 },
  whoText: { flex: 1, minWidth: 0 },
  whoLine: { flexDirection: "row", alignItems: "center", gap: 6 },
  whoName: { flexShrink: 1, fontFamily: font.semibold, fontSize: 17 },
  about: { fontFamily: font.regular, fontSize: 13 },
  banner: { paddingHorizontal: GUTTER, paddingVertical: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  bannerText: { fontFamily: font.regular, fontSize: 14 },
  bannerLink: { fontFamily: font.medium, textDecorationLine: "underline" },
  list: { paddingHorizontal: GUTTER - 4, paddingVertical: 8 },
  older: { alignItems: "center", paddingVertical: 4 },
  item: {},
  day: { alignSelf: "center", marginVertical: 8, fontFamily: font.medium, fontSize: 12 },
  note: { alignSelf: "center", marginVertical: 8, fontFamily: font.regular, fontSize: 12, textAlign: "center" },
  waiting: { alignSelf: "flex-end", marginTop: 2, paddingHorizontal: 4, fontFamily: font.regular, fontSize: 12 },
  bubble: { maxWidth: "85%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 7 },
  bubbleText: { fontFamily: font.regular, fontSize: 16, lineHeight: 21 },
  actions: {
    marginTop: 4,
    paddingHorizontal: 4,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    maxWidth: "100%",
  },
  small: { fontFamily: font.regular, fontSize: 12 },
  smallButton: {
    minHeight: 28,
    minWidth: 56,
    borderRadius: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  smallButtonText: { fontFamily: font.medium, fontSize: 13 },
  foot: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: GUTTER - 8,
    paddingTop: 8,
  },
  composer: { gap: 6 },
  composeRow: { flexDirection: "row", alignItems: "flex-end", gap: 8 },
  field: {
    flex: 1,
    minHeight: 40,
    maxHeight: 144,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingTop: 9,
    paddingBottom: 9,
    fontFamily: font.regular,
    fontSize: 16,
  },
  send: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  unblock: { alignItems: "center", paddingVertical: 4 },
});
