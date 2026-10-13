import * as React from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

import {
  FACT_WAY_WORDS,
  relativeLine,
  type FactProposal,
  type MentionOffer,
  type ScribeFacts,
} from "@/lib/scribe-facts";
import { font, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { CheckIcon } from "@/ui/icons";

/** Where looking for facts has got to. */
export type FactsState =
  | { at: "looking" }
  | { at: "failed"; error: string }
  | { at: "found"; facts: ScribeFacts };

/**
 * What the story tells the tree (Step 148.2), under the write-up: each
 * detail about someone on it to tick, the people it mentions to tag, and
 * the relatives it names who aren't on it yet. Nothing is ticked or tagged
 * until the member says so; saving the story makes what they ticked.
 */
export function FactsReview({
  state,
  onRetry,
  accepted,
  onToggleFact,
  mentions,
  tagged,
  onToggleMention,
}: {
  state: FactsState;
  onRetry: () => void;
  accepted: ReadonlySet<string>;
  onToggleFact: (key: string) => void;
  /** Those mentioned who can be tagged on the tree it's told on. */
  mentions: MentionOffer[];
  tagged: ReadonlySet<string>;
  onToggleMention: (personId: string) => void;
}) {
  const palette = usePalette();
  const muted = { color: palette.mutedForeground };

  if (state.at === "looking") {
    return (
      <View style={styles.looking}>
        <ActivityIndicator color={palette.green} />
        <Text style={[styles.note, muted]}>Looking for facts…</Text>
      </View>
    );
  }
  if (state.at === "failed") {
    return (
      <View style={styles.section}>
        <Text style={[styles.note, muted]}>{state.error}</Text>
        <Button variant="link" label="Try again" onPress={onRetry} />
      </View>
    );
  }

  const { facts, relatives } = state.facts;
  if (!facts.length && !mentions.length && !relatives.length) {
    return <Text style={[styles.note, muted]}>Nothing new for the tree.</Text>;
  }
  return (
    <>
      {facts.length ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.foreground }]}>For the tree</Text>
          {facts.map((fact) => (
            <FactCard
              key={fact.key}
              fact={fact}
              on={accepted.has(fact.key)}
              onPress={() => onToggleFact(fact.key)}
            />
          ))}
        </View>
      ) : null}
      {mentions.length ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.foreground }]}>People mentioned</Text>
          <View style={styles.chips}>
            {mentions.map((m) => (
              <Chip
                key={m.personId}
                label={m.name}
                on={tagged.has(m.personId)}
                onPress={() => onToggleMention(m.personId)}
              />
            ))}
          </View>
        </View>
      ) : null}
      {relatives.length ? (
        <View style={styles.section}>
          <Text style={[styles.label, { color: palette.foreground }]}>Not on the tree yet</Text>
          {relatives.map((r) => (
            <View key={r.key} style={styles.relative}>
              <Text style={[styles.body, { color: palette.foreground }]}>
                {[relativeLine(r), r.born ? `born ${r.born}` : null, r.died ? (r.diedWhen ? `died ${r.diedWhen}` : "has died") : null]
                  .filter(Boolean)
                  .join(" · ")}
              </Text>
              {r.evidence ? <Text style={[styles.said, muted]}>“{r.evidence}”</Text> : null}
            </View>
          ))}
        </View>
      ) : null}
    </>
  );
}

function FactCard({
  fact,
  on,
  onPress,
}: {
  fact: FactProposal;
  on: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  const muted = { color: palette.mutedForeground };
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      aria-checked={on}
      accessibilityLabel={[
        fact.name,
        ...fact.rows.map((r) => `${r.label}: ${r.to ?? "none"}`),
        FACT_WAY_WORDS[fact.way],
      ].join(". ")}
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: on ? palette.primary : palette.border, backgroundColor: palette.card },
        pressed && { opacity: 0.8 },
      ]}
    >
      <View
        style={[
          styles.box,
          on
            ? { backgroundColor: palette.primary, borderColor: palette.primary }
            : { borderColor: palette.mutedForeground },
        ]}
      >
        {on ? <CheckIcon size={16} color={palette.primaryForeground} /> : null}
      </View>
      <View style={styles.cardBody}>
        <Text style={[styles.name, { color: palette.foreground }]}>{fact.name}</Text>
        {fact.rows.map((row) => (
          <Text key={row.detail} style={[styles.body, { color: palette.foreground }]}>
            {row.label}: {row.from ? `${row.from} → ` : ""}
            {row.to ?? "none"}
          </Text>
        ))}
        {fact.evidence ? <Text style={[styles.said, muted]}>“{fact.evidence}”</Text> : null}
        <Text style={[styles.way, muted]}>{FACT_WAY_WORDS[fact.way]}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { gap: 8 },
  looking: { flexDirection: "row", alignItems: "center", gap: 10 },
  label: { fontFamily: font.medium, fontSize: 14 },
  note: { fontFamily: font.regular, fontSize: 15 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  cardBody: { flex: 1, gap: 3 },
  name: { fontFamily: font.semibold, fontSize: 16 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  said: { fontFamily: font.regular, fontSize: 14, lineHeight: 20, fontStyle: "italic" },
  way: { fontFamily: font.medium, fontSize: 13 },
  relative: { gap: 2 },
});
