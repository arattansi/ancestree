import * as React from "react";
import { Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { formatPartialDate } from "@/lib/partial-date";
import type { SheetPhoto, SheetReport, SheetStory, SheetTree } from "@/person/sheet";
import { font, GUTTER, usePalette } from "@/theme";
import { XIcon } from "@/ui/icons";

/** A section of the full details, under its heading. */
export function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.foreground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A label and its value, as the web's details grid shows them. */
export function Field({ label, value }: { label: string; value: string }) {
  const palette = usePalette();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: palette.mutedForeground }]}>{label}</Text>
      <Text style={[styles.fieldValue, { color: palette.foreground }]}>{value}</Text>
    </View>
  );
}

/**
 * The trees they're on that the member may open (Step 25): the member's
 * own, and any they visit, as the web's "On" / "Also on" row.
 */
export function Trees({ trees }: { trees: SheetTree[] }) {
  const palette = usePalette();
  return (
    <View style={styles.chips}>
      {trees.map((t) => (
        <View
          key={t.id}
          style={[styles.tree, { borderColor: palette.border, backgroundColor: palette.muted }]}
        >
          <Text style={[styles.treeName, { color: palette.foreground }]}>{t.name}</Text>
          {t.visitor ? (
            <Text style={[styles.treeNote, { color: palette.mutedForeground }]}>visiting</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

const THUMB_GAP = 6;

/** Their album (Step 88.5): the photos the member may see; tap one to see it whole. */
export function Album({ photos, width }: { photos: SheetPhoto[]; width: number }) {
  const palette = usePalette();
  const [open, setOpen] = React.useState<SheetPhoto | null>(null);
  const size = Math.floor((width - 2 * THUMB_GAP) / 3);
  return (
    <>
      <View style={styles.grid}>
        {photos.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="imagebutton"
            accessibilityLabel={p.description || "Photo"}
            onPress={() => setOpen(p)}
            style={({ pressed }) => pressed && { opacity: 0.7 }}
          >
            {p.url ? (
              <Image
                source={{ uri: p.url }}
                style={[styles.thumb, { width: size, height: size, backgroundColor: palette.muted }]}
              />
            ) : (
              <View style={[styles.thumb, { width: size, height: size, backgroundColor: palette.muted }]} />
            )}
            {p.status === "pending" ? (
              <Text style={[styles.pending, { color: palette.foreground, backgroundColor: palette.background }]}>
                waiting
              </Text>
            ) : null}
          </Pressable>
        ))}
      </View>
      <Modal visible={!!open} animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={styles.viewer}>
          {open?.fullUrl || open?.url ? (
            <Image source={{ uri: (open.fullUrl ?? open.url)! }} style={styles.whole} resizeMode="contain" />
          ) : null}
          {open?.description ? <Text style={styles.caption}>{open.description}</Text> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={() => setOpen(null)}
            hitSlop={10}
            style={styles.close}
          >
            <XIcon color="#ffffff" />
          </Pressable>
        </View>
      </Modal>
    </>
  );
}

/** A story's words without their Markdown marks, for reading on the phone. */
function plain(body: string): string {
  return body
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/^>\s?/gm, "")
    .trim();
}

/** Their stories (Step 88.3): title, who told it and when, and its words. */
export function Stories({ stories }: { stories: SheetStory[] }) {
  return (
    <View style={styles.stories}>
      {stories.map((s) => (
        <StoryCard key={s.id} story={s} />
      ))}
    </View>
  );
}

function StoryCard({ story }: { story: SheetStory }) {
  const palette = usePalette();
  const [whole, setWhole] = React.useState(false);
  const told = story.toldOn ? formatPartialDate(story.toldOn, story.toldPrecision) : null;
  const tellers = story.credits.filter((c) => c.role === "storyteller").map((c) => c.name);
  const meta = [
    tellers.length ? `Told by ${tellers.join(" and ")}` : `Added by ${story.toldBy}`,
    told,
  ]
    .filter(Boolean)
    .join(" · ");
  const words = story.body ? plain(story.body) : "";
  return (
    <View style={[styles.story, { borderColor: palette.border, backgroundColor: palette.card }]}>
      <Text style={[styles.storyTitle, { color: palette.foreground }]}>{story.title || "A story"}</Text>
      <Text style={[styles.storyMeta, { color: palette.mutedForeground }]}>
        {meta}
        {story.status === "pending" ? " · waiting for approval" : ""}
        {story.hasRecording ? " · recorded" : ""}
      </Text>
      {words ? (
        <Pressable
          accessibilityRole="button"
          accessibilityHint={whole ? "Shows less" : "Shows the whole story"}
          onPress={() => setWhole(!whole)}
        >
          <Text numberOfLines={whole ? undefined : 5} style={[styles.storyBody, { color: palette.foreground }]}>
            {words}
          </Text>
          <Text style={[styles.more, { color: palette.mutedForeground }]}>
            {whole ? "Show less" : "Read it all"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** Open reports on the entry the member may see (Step 88.2). */
export function Reports({ reports }: { reports: SheetReport[] }) {
  const palette = usePalette();
  return (
    <View style={styles.stories}>
      {reports.map((r) => (
        <View key={r.id} style={[styles.report, { borderColor: palette.destructive }]}>
          <Text style={[styles.storyMeta, { color: palette.mutedForeground }]}>
            {r.dispute ? "Disputes who claimed it" : "Reported"} · {r.authorName}
          </Text>
          <Text style={[styles.storyBody, { color: palette.foreground }]}>{r.body}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  section: { marginTop: 22, paddingHorizontal: GUTTER + 4, gap: 10 },
  sectionTitle: { fontFamily: font.semibold, fontSize: 17 },
  field: { gap: 2 },
  fieldLabel: { fontFamily: font.medium, fontSize: 13 },
  fieldValue: { fontFamily: font.regular, fontSize: 16 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tree: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  treeName: { fontFamily: font.medium, fontSize: 14 },
  treeNote: { fontFamily: font.regular, fontSize: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: THUMB_GAP },
  thumb: { borderRadius: 8 },
  pending: {
    position: "absolute",
    left: 4,
    bottom: 4,
    fontFamily: font.medium,
    fontSize: 11,
    paddingHorizontal: 5,
    borderRadius: 4,
    overflow: "hidden",
  },
  viewer: { flex: 1, backgroundColor: "#000000", justifyContent: "center" },
  whole: { width: "100%", height: "80%" },
  caption: {
    color: "#ffffff",
    fontFamily: font.regular,
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: GUTTER,
    marginTop: 12,
  },
  close: { position: "absolute", top: 60, right: 20 },
  stories: { gap: 10 },
  story: { borderWidth: 1, borderRadius: 12, padding: 14, gap: 6 },
  storyTitle: { fontFamily: font.semibold, fontSize: 16 },
  storyMeta: { fontFamily: font.regular, fontSize: 13 },
  storyBody: { fontFamily: font.regular, fontSize: 15, lineHeight: 22 },
  more: { fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  report: { borderLeftWidth: 3, paddingLeft: 10, gap: 4 },
});
