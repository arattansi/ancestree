import { router } from "expo-router";
import * as React from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { filterContacts, type MessengerContact } from "@/lib/messenger";
import { closestFirst, type MemberRelation } from "@/lib/messenger-relation";
import { aboutLine, useRelations } from "@/messages/relations";
import { messenger, useMessenger } from "@/messages/store";
import { ErrorText, Face, Words } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { ScreenHeader } from "@/ui/header";

/**
 * A new message (Step 179.1): anyone on a tree you're on, closest first
 * (Step 177.1), so Mum is at the top, each with who they are to you.
 */
export default function NewMessage() {
  const palette = usePalette();
  const data = useMessenger((s) => s.data);
  const opening = useMessenger((s) => s.opening);
  const relations = useRelations();
  const [query, setQuery] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const shown = data
    ? closestFirst(filterContacts(data.contacts, query), (c) => relations.get(c.userId)?.distance ?? null)
    : [];

  async function open(userId: string) {
    setError(null);
    const id = await messenger.openWith(userId);
    if (id) router.replace({ pathname: "/messages/[id]", params: { id } });
    else setError("Couldn't open the conversation. Try again.");
  }

  return (
    <SafeAreaView edges={["top", "bottom"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <ScreenHeader title="New Message" />
      <View style={[styles.search, { borderBottomColor: palette.border }]}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Name or tree"
          accessibilityLabel="Search your family"
          placeholderTextColor={palette.mutedForeground}
          autoFocus
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[
            styles.input,
            { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.card },
          ]}
        />
        {error ? <ErrorText>{error}</ErrorText> : null}
      </View>
      {!data ? (
        <View style={styles.centre}>
          <ActivityIndicator color={palette.mutedForeground} />
        </View>
      ) : (
        <FlatList
          data={shown}
          keyExtractor={(c) => c.userId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Words muted>
                {data.contacts.length === 0 ? "No one else is on your trees yet." : "No one by that name."}
              </Words>
            </View>
          }
          renderItem={({ item }) => (
            <ContactRow
              contact={item}
              relation={relations.get(item.userId)}
              busy={opening === item.userId}
              disabled={!!opening}
              onPress={() => void open(item.userId)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function ContactRow({
  contact: c,
  relation,
  busy,
  disabled,
  onPress,
}: {
  contact: MessengerContact;
  relation: MemberRelation | undefined;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const about = aboutLine(relation, c.trees);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { backgroundColor: palette.muted },
        disabled && !busy && { opacity: 0.6 },
      ]}
    >
      <Face name={c.name} />
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.name, { color: palette.foreground }]}>
          {c.name}
        </Text>
        {about ? (
          <Text numberOfLines={1} style={[styles.about, { color: palette.mutedForeground }]}>
            {about}
          </Text>
        ) : null}
      </View>
      {busy ? <ActivityIndicator color={palette.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center" },
  search: { padding: GUTTER - 4, gap: 8, borderBottomWidth: StyleSheet.hairlineWidth },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    fontFamily: font.regular,
    fontSize: 17,
  },
  list: { paddingVertical: 4 },
  empty: { padding: GUTTER },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: GUTTER,
    paddingVertical: 8,
    minHeight: 56,
  },
  rowText: { flex: 1, minWidth: 0 },
  name: { fontFamily: font.medium, fontSize: 16 },
  about: { fontFamily: font.regular, fontSize: 13 },
});
