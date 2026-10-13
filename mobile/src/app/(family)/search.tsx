import { router } from "expo-router";
import * as React from "react";
import { StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { usePalette } from "@/theme";
import { PeopleList } from "@/ui/people-list";
import { TextField } from "@/ui/text-field";

/** Every name on the member's trees, any part of it, to jump straight to. */
const matches = (needle: string) => (name: string) =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .includes(needle);

export default function Search() {
  const palette = usePalette();
  const { state, walkTo } = useFamily();
  const [query, setQuery] = React.useState("");
  const people = state.status === "ready" ? [...state.family.people.values()] : [];
  const needle = query
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
  const found = needle
    ? people
        .filter((p) =>
          [personDisplayName(p), p.first_name, p.middle_name, p.maiden_name]
            .filter((n): n is string => !!n)
            .some(matches(needle)),
        )
        .sort((a, b) => personDisplayName(a).localeCompare(personDisplayName(b)))
        .slice(0, 50)
    : [];

  return (
    <SafeAreaView
      edges={["bottom"]}
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <PeopleList
        title="Find someone"
        people={found}
        empty={needle ? "Nobody by that name." : undefined}
        header={
          <View style={styles.field}>
            <TextField
              label="Name"
              value={query}
              onChangeText={setQuery}
              autoFocus
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
          </View>
        }
        onPick={(id) => {
          router.back();
          walkTo(id);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  field: { paddingHorizontal: 4 },
});
