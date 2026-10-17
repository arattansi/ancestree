import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { font, GUTTER, usePalette } from "@/theme";
import { BookOpenIcon, ImagePlusIcon, UserPlusIcon } from "@/ui/icons";

/**
 * The + menu (Step 179.3), as the web's (`components/tree/add-menu.tsx`,
 * Step 145): a relative of whoever is on the leaf view, photos of them, or
 * a story about them, written. Each is added on the first of the member's
 * trees that shows them in full, their home tree first.
 */
export default function AddMenu() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  const person = state.status === "ready" ? state.family.people.get(id) : null;
  if (!person) return null;
  const name = personDisplayName(person);
  const go = (pathname: "/add/relative/[id]" | "/add/photos/[id]" | "/add/story/[id]") =>
    router.replace({ pathname, params: { id } });

  return (
    <View style={styles.body}>
      <Item label={`Relative of ${name}`} onPress={() => go("/add/relative/[id]")}>
        <UserPlusIcon color={palette.foreground} />
      </Item>
      <Item label={`Photos of ${name}`} onPress={() => go("/add/photos/[id]")}>
        <ImagePlusIcon color={palette.foreground} />
      </Item>
      <Item label={`Story about ${name}`} onPress={() => go("/add/story/[id]")}>
        <BookOpenIcon color={palette.foreground} />
      </Item>
    </View>
  );
}

function Item({
  label,
  onPress,
  children,
}: {
  label: string;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.item, { borderColor: palette.border }, pressed && { opacity: 0.6 }]}
    >
      {children}
      <Text numberOfLines={1} style={[styles.label, { color: palette.foreground }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: GUTTER, paddingTop: 22, paddingBottom: 24 },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    minHeight: 56,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  label: { flex: 1, fontFamily: font.medium, fontSize: 17 },
});
