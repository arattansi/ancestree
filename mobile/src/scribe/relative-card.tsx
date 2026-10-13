import * as React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { relativeLine, type RelativeProposal } from "@/lib/scribe-facts";
import {
  questionKey,
  relativeName,
  yesWords,
  type RelativeDraft,
  type Resolution,
} from "@/lib/scribe-relatives";
import type { RelativeView } from "@/scribe/use-relatives";
import { font, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { CheckIcon } from "@/ui/icons";
import { TextField } from "@/ui/text-field";

/**
 * Someone the story names who isn't on the tree (Step 148.3), to tick and
 * add once the story's saved. Ticked, the card takes their names, as the
 * scribe heard them, to correct, and asks what the web's add form asks:
 * whether they're 18 or older, and the connections the tree implies.
 */
export function RelativeCard({
  view,
  onToggle,
  onEdit,
  onRetry,
}: {
  view: RelativeView;
  onToggle: () => void;
  onEdit: (patch: Partial<RelativeDraft>) => void;
  onRetry: () => void;
}) {
  const palette = usePalette();
  const muted = { color: palette.mutedForeground };
  const { r, draft, ticked: on, status } = view;
  const name = relativeName(draft);
  const line = relativeLine({
    ...r,
    firstName: draft.firstName.trim() || r.firstName,
    lastName: draft.lastName.trim() || null,
  } satisfies RelativeProposal);
  const life = [
    r.born ? `born ${r.born}` : null,
    r.died ? (r.diedWhen ? `died ${r.diedWhen}` : "has died") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: on ? palette.primary : palette.border,
          backgroundColor: palette.card,
        },
      ]}
    >
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on }}
        aria-checked={on}
        accessibilityLabel={[line, life, "Adds them to the tree"]
          .filter(Boolean)
          .join(". ")}
        onPress={onToggle}
        style={({ pressed }) => [styles.head, pressed && { opacity: 0.8 }]}
      >
        <View
          style={[
            styles.box,
            on
              ? {
                  backgroundColor: palette.primary,
                  borderColor: palette.primary,
                }
              : { borderColor: palette.mutedForeground },
          ]}
        >
          {on ? (
            <CheckIcon size={16} color={palette.primaryForeground} />
          ) : null}
        </View>
        <View style={styles.headBody}>
          <Text style={[styles.name, { color: palette.foreground }]}>
            {line}
          </Text>
          {life ? (
            <Text style={[styles.body, { color: palette.foreground }]}>
              {life}
            </Text>
          ) : null}
          {r.evidence ? (
            <Text style={[styles.said, muted]}>“{r.evidence}”</Text>
          ) : null}
          <Text style={[styles.way, muted]}>Adds them to the tree</Text>
        </View>
      </Pressable>

      {on ? (
        <View style={styles.more}>
          <View style={styles.names}>
            <View style={styles.flex}>
              <TextField
                label="First name"
                value={draft.firstName}
                onChangeText={(firstName) => onEdit({ firstName })}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
            <View style={styles.flex}>
              <TextField
                label="Last name"
                value={draft.lastName}
                onChangeText={(lastName) => onEdit({ lastName })}
                autoCapitalize="words"
                autoCorrect={false}
              />
            </View>
          </View>

          {status.at === "refused" ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.body, { color: palette.destructive }]}
            >
              {status.why}
            </Text>
          ) : status.at === "same" ? (
            <Text style={[styles.body, muted]}>
              Already on the tree as {status.as}.
            </Text>
          ) : null}

          {view.asksAdult ? (
            <Question
              question={`Is ${name} 18 or older?`}
              choices={YES_NO}
              value={draft.adult === null ? null : draft.adult ? "yes" : "no"}
              onPick={(v) => onEdit({ adult: v === "yes" })}
            />
          ) : null}
          {(view.questions ?? []).map((q) => (
            <Question
              key={questionKey(q)}
              question={q.reason}
              choices={[
                { value: "accepted", label: yesWords(q) },
                { value: "dismissed", label: "no" },
                { value: "pending", label: "skip for now" },
              ]}
              value={draft.answers[questionKey(q)] ?? null}
              onPick={(v) =>
                onEdit({ answers: { [questionKey(q)]: v as Resolution } })
              }
            />
          ))}
          {view.asks.map((a) => (
            <Question
              key={a.id}
              question={`Is ${a.name ?? "this person"} 18 or older?`}
              choices={YES_NO}
              value={
                draft.existing[a.id] === undefined
                  ? null
                  : draft.existing[a.id]
                    ? "yes"
                    : "no"
              }
              onPick={(v) => onEdit({ existing: { [a.id]: v === "yes" } })}
            />
          ))}

          {view.checking || view.questions === null ? (
            <View style={styles.checking}>
              <ActivityIndicator color={palette.green} />
              <Text style={[styles.body, muted]}>Checking…</Text>
            </View>
          ) : view.checkFailed ? (
            <View style={styles.checking}>
              <Text style={[styles.body, muted]}>Couldn’t check them.</Text>
              <Button variant="link" label="Try again" onPress={onRetry} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const YES_NO = [
  { value: "yes", label: "yes" },
  { value: "no", label: "no" },
];

/** A question with its answers to pick from. */
function Question({
  question,
  choices,
  value,
  onPick,
}: {
  question: string;
  choices: { value: string; label: string }[];
  value: string | null;
  onPick: (value: string) => void;
}) {
  const palette = usePalette();
  return (
    <View style={styles.question}>
      <Text style={[styles.ask, { color: palette.foreground }]}>
        {question}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={question}
        style={styles.chips}
      >
        {choices.map((c) => (
          <Chip
            key={c.value}
            label={c.label}
            on={value === c.value}
            onPress={() => onPick(c.value)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 12, borderWidth: 1 },
  head: { flexDirection: "row", gap: 12, padding: 14 },
  headBody: { flex: 1, gap: 3 },
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  name: { fontFamily: font.semibold, fontSize: 16 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  said: {
    fontFamily: font.regular,
    fontSize: 14,
    lineHeight: 20,
    fontStyle: "italic",
  },
  way: { fontFamily: font.medium, fontSize: 13 },
  more: { gap: 14, paddingHorizontal: 14, paddingBottom: 14 },
  names: { flexDirection: "row", gap: 10 },
  flex: { flex: 1 },
  question: { gap: 8 },
  ask: { fontFamily: font.medium, fontSize: 15, lineHeight: 21 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  checking: { flexDirection: "row", alignItems: "center", gap: 8 },
});
