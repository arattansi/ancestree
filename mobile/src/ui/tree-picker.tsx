import * as React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { FamilyTree } from "@/family/load";
import { font, GUTTER, usePalette } from "@/theme";
import { CheckIcon, ChevronDownIcon } from "@/ui/icons";

/**
 * Which tree the member is looking at (Step 206): a chevron beside the
 * wordmark (no name, Aalim: "just the arrow"), opening a menu of every tree
 * they're on, the current one ticked: the web's tree switcher on a phone.
 * Picking one opens the whole of that tree.
 */
export function TreePicker({
  trees,
  currentId,
  onPick,
}: {
  trees: Map<string, FamilyTree>;
  currentId: string | null;
  onPick: (id: string) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = React.useState(false);
  const current = currentId ? trees.get(currentId) : null;
  const label = current?.name ?? "your trees";
  if (trees.size === 0) return null;
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Tree: ${label}. Switch tree`}
        onPress={() => setOpen(true)}
        hitSlop={10}
        style={({ pressed }) => [styles.trigger, pressed && { opacity: 0.6 }]}
      >
        <ChevronDownIcon size={18} color={palette.mutedForeground} />
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityLabel="Close"
          style={styles.backdrop}
          onPress={() => setOpen(false)}
        >
          <View
            accessibilityRole="menu"
            style={[
              styles.menu,
              {
                top: insets.top + 50,
                backgroundColor: palette.card,
                borderColor: palette.border,
                shadowColor: "#000",
              },
            ]}
          >
            <Text style={[styles.heading, { color: palette.mutedForeground }]}>Your trees</Text>
            {[...trees.entries()].map(([id, tree]) => {
              const isCurrent = id === currentId;
              return (
                <Pressable
                  key={id}
                  accessibilityRole="menuitem"
                  accessibilityState={{ selected: isCurrent }}
                  onPress={() => {
                    setOpen(false);
                    onPick(id);
                  }}
                  style={({ pressed }) => [styles.item, pressed && { backgroundColor: palette.muted }]}
                >
                  <View style={styles.tick}>
                    {isCurrent ? <CheckIcon size={16} color={palette.foreground} /> : null}
                  </View>
                  <Text numberOfLines={1} style={[styles.itemText, { color: palette.foreground }]}>
                    {tree.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: 28, height: 36, alignItems: "center", justifyContent: "center" },
  backdrop: { flex: 1 },
  menu: {
    position: "absolute",
    left: GUTTER,
    minWidth: 220,
    maxWidth: 320,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    shadowOpacity: 0.12,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  heading: {
    fontFamily: font.medium,
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 4,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 12,
  },
  tick: { width: 18, alignItems: "center" },
  itemText: { fontFamily: font.regular, fontSize: 16, flexShrink: 1 },
});
