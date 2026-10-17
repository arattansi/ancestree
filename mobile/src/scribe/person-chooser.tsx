import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { personDisplayName } from "@/lib/person-name";
import type { FamilyPerson } from "@/family/load";
import { font, usePalette } from "@/theme";
import { Chip } from "@/ui/chip";
import { TextField } from "@/ui/text-field";

/** How many matches the search shows at once. */
const SHOWN = 6;

/**
 * Who a story is about, or who told it or asked (Step 179.6): the chosen
 * as chips (tap one to take it off), and **change** or **add** opening a
 * search of everyone who may be chosen. With `one`, choosing replaces.
 */
export function PersonChooser({
  label,
  people,
  chosen,
  onChange,
  selfId,
  one = false,
}: {
  label: string;
  /** Everyone who may be chosen, the likeliest first. */
  people: FamilyPerson[];
  chosen: string[];
  onChange: (ids: string[]) => void;
  /** The member, named "You". */
  selfId: string;
  one?: boolean;
}) {
  const palette = usePalette();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const nameOf = (p: FamilyPerson) => (p.id === selfId ? "You" : personDisplayName(p));
  const byId = new Map(people.map((p) => [p.id, p]));
  const q = query.trim().toLowerCase();
  const matches = people
    .filter((p) => !chosen.includes(p.id))
    .filter((p) => !q || nameOf(p).toLowerCase().includes(q) || personDisplayName(p).toLowerCase().includes(q))
    .slice(0, SHOWN);

  const pick = (id: string) => {
    onChange(one ? [id] : [...chosen, id]);
    setOpen(false);
    setQuery("");
  };

  return (
    <View style={styles.box}>
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
      <View style={styles.chips}>
        {chosen.map((id) => {
          const p = byId.get(id);
          return p ? (
            <Chip
              key={id}
              label={nameOf(p)}
              on
              onPress={() => (one ? setOpen(true) : onChange(chosen.filter((x) => x !== id)))}
            />
          ) : null;
        })}
        <Pressable
          accessibilityRole="button"
          onPress={() => setOpen(!open)}
          hitSlop={6}
          style={({ pressed }) => [styles.more, pressed && { opacity: 0.6 }]}
        >
          <Text style={[styles.moreText, { color: palette.mutedForeground }]}>
            {open ? "close" : one || chosen.length ? (one ? "change" : "add") : "choose"}
          </Text>
        </Pressable>
      </View>
      {open ? (
        <View style={styles.search}>
          <TextField
            label="Find someone"
            value={query}
            onChangeText={setQuery}
            autoCorrect={false}
            autoFocus
          />
          {matches.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => pick(p.id)}
              style={({ pressed }) => [styles.row, { borderColor: palette.border }, pressed && { opacity: 0.6 }]}
            >
              <Text style={[styles.rowText, { color: palette.foreground }]}>{nameOf(p)}</Text>
            </Pressable>
          ))}
          {matches.length === 0 ? (
            <Text style={[styles.none, { color: palette.mutedForeground }]}>Nobody by that name.</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 8 },
  label: { fontFamily: font.medium, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  more: { paddingHorizontal: 6, paddingVertical: 8 },
  moreText: { fontFamily: font.medium, fontSize: 15 },
  search: { gap: 4 },
  row: { paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontFamily: font.regular, fontSize: 16 },
  none: { fontFamily: font.regular, fontSize: 15, paddingVertical: 8 },
});
