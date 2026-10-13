import * as React from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";

import { personDisplayName, personInitials, personLifespan } from "@/lib/person-name";
import type { FamilyPerson } from "@/family/load";
import { font, GUTTER, usePalette } from "@/theme";

/** A list of people to walk to: a circle, their name and their years. */
export function PeopleList({
  title,
  people,
  onPick,
  header,
  empty,
}: {
  title?: string;
  people: FamilyPerson[];
  onPick: (id: string) => void;
  header?: React.ReactElement;
  empty?: string;
}) {
  const palette = usePalette();
  return (
    <FlatList
      data={people}
      keyExtractor={(p) => p.id}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View style={styles.head}>
          {title ? (
            <Text style={[styles.title, { color: palette.foreground }]}>{title}</Text>
          ) : null}
          {header}
        </View>
      }
      ListEmptyComponent={
        empty ? (
          <Text style={[styles.empty, { color: palette.mutedForeground }]}>{empty}</Text>
        ) : null
      }
      renderItem={({ item }) => {
        const years = personLifespan(item);
        const deceased = !!item.is_deceased || !!item.date_of_death;
        return (
          <Pressable
            accessibilityRole="button"
            onPress={() => onPick(item.id)}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
          >
            <View
              style={[
                styles.circle,
                {
                  borderColor: palette.green,
                  borderStyle: deceased ? "dashed" : "solid",
                  backgroundColor: palette.card,
                },
              ]}
            >
              <Text style={[styles.initials, { color: palette.foreground }]}>
                {personInitials(item)}
              </Text>
            </View>
            <View style={styles.text}>
              <Text
                numberOfLines={1}
                style={[styles.name, { color: palette.foreground }]}
              >
                {personDisplayName(item)}
              </Text>
              {years ? (
                <Text style={[styles.years, { color: palette.mutedForeground }]}>
                  {years}
                </Text>
              ) : null}
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: GUTTER, paddingBottom: 32 },
  head: { paddingTop: 24, paddingBottom: 8, gap: 12 },
  title: { fontFamily: font.semibold, fontSize: 22, paddingHorizontal: 4 },
  empty: { fontFamily: font.regular, fontSize: 16, padding: 4 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    minHeight: 56,
    paddingHorizontal: 4,
  },
  circle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: font.semibold, fontSize: 14 },
  text: { flex: 1 },
  name: { fontFamily: font.medium, fontSize: 17 },
  years: { fontFamily: font.regular, fontSize: 14 },
});
