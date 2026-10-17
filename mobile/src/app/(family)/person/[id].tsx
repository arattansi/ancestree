import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { leafLabel, nativeLeaf } from "@/lib/native-leaf";
import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import { maidenLine, personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { messenger, useMessageTarget, useMessenger } from "@/messages/store";
import { ErrorText } from "@/messages/ui";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";

/**
 * A leaf's details: who they are, when and where they were born and died,
 * where they live now (Step 153), and the tree their leaf comes from; and a story to tell about them, out
 * loud, to the scribe (Step 148); and **message**, when a member you share a
 * tree with is behind the entry (Step 179.1). Reading their stories and the
 * album come next (Phase 1 of the mobile plan).
 */
export default function PersonSheet() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  const person = state.status === "ready" ? state.family.people.get(id) : null;
  const self = state.status === "ready" && state.family.selfId === id;
  const messageTo = useMessageTarget(self ? null : id);
  const opening = useMessenger((s) => s.opening);
  const [messageError, setMessageError] = React.useState<string | null>(null);
  if (!person) return null;

  async function message(userId: string) {
    setMessageError(null);
    const conversation = await messenger.openWith(userId);
    if (!conversation) {
      setMessageError("Couldn't open the conversation. Try again.");
      return;
    }
    // The sheet goes, and the conversation opens over the leaf.
    if (router.canGoBack()) router.back();
    router.push({ pathname: "/messages/[id]", params: { id: conversation } });
  }

  const born = formatPartialDate(
    person.date_of_birth,
    person.date_of_birth_precision,
    asDayMonth(person.birth_month, person.birth_day),
    person.date_of_birth_circa,
  );
  const died = formatPartialDate(
    person.date_of_death,
    person.date_of_death_precision,
    null,
    person.date_of_death_circa,
  );
  const birthplace =
    [person.city_of_birth, person.country_of_birth].filter(Boolean).join(", ") ||
    null;
  const leaf = leafLabel(nativeLeaf(person));
  const full = [
    person.preferred_name || person.first_name,
    person.preferred_name && person.preferred_name !== person.first_name
      ? null
      : person.middle_name,
    person.last_name,
  ]
    .filter(Boolean)
    .join(" ");

  const rows: [string, string | null][] = [
    ["Born", born],
    ["Died", died ?? (person.is_deceased ? "Deceased" : null)],
    ["Birthplace", birthplace],
    ["Lives in", person.is_deceased ? null : person.place_of_residence],
    ["Leaf", leaf],
  ];

  return (
    <ScrollView contentContainerStyle={styles.body}>
      <Text style={[styles.name, { color: palette.foreground }]}>
        {person.placeholder_number != null ? personDisplayName(person) : full}
      </Text>
      {maidenLine(person) ? (
        <Text style={[styles.maiden, { color: palette.mutedForeground }]}>
          {maidenLine(person)}
        </Text>
      ) : null}
      <View style={styles.rows}>
        {rows
          .filter((r): r is [string, string] => !!r[1])
          .map(([label, value]) => (
            <View key={label} style={styles.row}>
              <Text style={[styles.label, { color: palette.mutedForeground }]}>
                {label}
              </Text>
              <Text style={[styles.value, { color: palette.foreground }]}>
                {value}
              </Text>
            </View>
          ))}
      </View>
      {person.fullOn.length || messageTo ? (
        <View style={styles.actions}>
          {person.fullOn.length ? (
            <Button
              label="tell a story"
              onPress={() =>
                router.push({
                  pathname: "/scribe/[id]",
                  params: { id: person.id },
                })
              }
            />
          ) : null}
          {messageTo ? (
            <Button
              variant="outline"
              label="message"
              busy={opening === messageTo}
              disabled={!!opening}
              onPress={() => void message(messageTo)}
            />
          ) : null}
          {messageError ? <ErrorText>{messageError}</ErrorText> : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: { padding: GUTTER + 8, paddingTop: 28, gap: 4 },
  name: { fontFamily: font.semibold, fontSize: 24 },
  maiden: { fontFamily: font.regular, fontSize: 16 },
  rows: { marginTop: 20, gap: 14 },
  row: { gap: 2 },
  label: { fontFamily: font.medium, fontSize: 13 },
  value: { fontFamily: font.regular, fontSize: 17 },
  actions: { marginTop: 28, gap: 10 },
});
