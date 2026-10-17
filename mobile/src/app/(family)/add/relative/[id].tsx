import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";

import { personDisplayName } from "@/lib/person-name";
import type { RelativeProposal } from "@/lib/scribe-facts";
import type { RelativeMade } from "@/lib/scribe-relatives";
import { useFamily } from "@/family/family";
import type { Family, FamilyPerson } from "@/family/load";
import { detailsChanged } from "@/person/sheet";
import { RelativeCard } from "@/scribe/relative-card";
import { useRelatives } from "@/scribe/use-relatives";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { TextField } from "@/ui/text-field";

type Relation = RelativeProposal["relation"];

const RELATIONS: { value: Relation; label: string }[] = [
  { value: "parent", label: "parent" },
  { value: "child", label: "child" },
  { value: "sibling", label: "sibling" },
  { value: "spouse", label: "spouse" },
];

/**
 * A relative of someone (Step 179.3), from the + menu: what they are to
 * them, then the short add form the scribe uses for a relative a story
 * names (Step 148.3), with the web's rules: their names, "18 or older?",
 * the connections the tree implies, the database's say before anything is
 * kept, and an invite to claim the entry. They're added on the first of the
 * member's trees that shows the person in full. The leaf view's dashed
 * "+ parent" and "+ child" open it with `relation` chosen (Step 187).
 */
export default function AddRelative() {
  const palette = usePalette();
  const { id, relation } = useLocalSearchParams<{ id: string; relation?: string }>();
  const { state, reload } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const person = family?.people.get(id) ?? null;
  const [made, setMade] = React.useState<RelativeMade | null>(null);

  if (!family || !person) return null;
  if (made && !made.error) {
    return (
      <View style={styles.body}>
        <Text style={[styles.heading, { color: palette.foreground }]}>Added {made.name}</Text>
        {made.invited ? (
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            Invited to claim their entry.
          </Text>
        ) : made.inviteError ? (
          <Text style={[styles.note, { color: palette.destructive }]}>{made.inviteError}</Text>
        ) : null}
        <Button
          label="done"
          onPress={() => {
            reload();
            router.back();
          }}
        />
      </View>
    );
  }
  const chosen = RELATIONS.find((r) => r.value === relation)?.value ?? null;
  return <Form family={family} person={person} chosen={chosen} onMade={setMade} />;
}

function Form({
  family,
  person,
  chosen,
  onMade,
}: {
  family: Family;
  person: FamilyPerson;
  /** What they are to them, already chosen. */
  chosen: Relation | null;
  onMade: (made: RelativeMade) => void;
}) {
  const palette = usePalette();
  const name = personDisplayName(person);
  const [relation, setRelation] = React.useState<Relation | null>(chosen);
  const [sex, setSex] = React.useState<"male" | "female" | null>(null);
  const [died, setDied] = React.useState(false);
  const [year, setYear] = React.useState("");
  const [adding, setAdding] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const born = /^\d{4}$/.test(year.trim()) ? Number(year.trim()) : null;
  const proposals = React.useMemo<RelativeProposal[]>(
    () =>
      relation
        ? [
            {
              // What they are, and anything the questions turn on, so a
              // change is asked about afresh.
              key: `add:${relation}:${sex ?? ""}:${died ? "died" : ""}:${born ?? ""}`,
              firstName: null,
              lastName: null,
              sex,
              relation,
              ofId: person.id,
              ofName: name,
              born: born ? String(born) : null,
              died,
              diedWhen: null,
              evidence: "",
              bornYear: born ? { year: born, circa: false } : null,
              bornPlace: null,
              diedYear: null,
            },
          ]
        : [],
    [relation, sex, died, born, person.id, name],
  );
  const { views, edit, retry, problem, addTicked } = useRelatives(family, proposals, null, true);
  const view = views[0] ?? null;
  const treeId = person.fullOn[0] ?? null;

  async function add() {
    const why = problem();
    if (why) return setError(why);
    setAdding(true);
    setError(null);
    try {
      const [one] = await addTicked();
      if (!one) setError("Answer the questions above first.");
      else if (one.error) setError(one.error);
      else {
        detailsChanged();
        onMade(one);
      }
    } finally {
      setAdding(false);
    }
  }

  if (!treeId) {
    return (
      <View style={styles.body}>
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          Relatives of {name} are added on their own tree.
        </Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: palette.foreground }]}>A relative of {name}</Text>
        <Choice label={`What are they to ${person.preferred_name || person.first_name || name}?`}>
          {RELATIONS.map((r) => (
            <Chip
              key={r.value}
              label={r.label}
              on={relation === r.value}
              onPress={() => setRelation(r.value)}
            />
          ))}
        </Choice>
        {relation ? (
          <>
            <Choice label="Sex">
              <Chip label="male" on={sex === "male"} onPress={() => setSex(sex === "male" ? null : "male")} />
              <Chip label="female" on={sex === "female"} onPress={() => setSex(sex === "female" ? null : "female")} />
            </Choice>
            <View style={styles.row}>
              <View style={styles.year}>
                <TextField
                  label="Year born"
                  value={year}
                  onChangeText={setYear}
                  keyboardType="number-pad"
                  maxLength={4}
                />
              </View>
              <View style={styles.died}>
                <Chip label="has died" on={died} onPress={() => setDied(!died)} />
              </View>
            </View>
            {view ? (
              <RelativeCard
                fixed
                view={view}
                onToggle={() => {}}
                onEdit={(patch) => edit(view.r, patch)}
                onRetry={() => retry(view.r)}
              />
            ) : null}
            {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
            <Button
              label={adding ? "adding…" : "add"}
              disabled={adding || !view || view.status.at !== "ready"}
              onPress={() => void add()}
            />
          </>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Choice({ label, children }: { label: string; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.choice}>
      <Text style={[styles.label, { color: palette.foreground }]}>{label}</Text>
      <View style={styles.chips}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: GUTTER + 4, paddingTop: 26, gap: 18 },
  heading: { fontFamily: font.semibold, fontSize: 22 },
  note: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  choice: { gap: 8 },
  label: { fontFamily: font.medium, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  row: { flexDirection: "row", alignItems: "flex-end", gap: 12 },
  year: { width: 120 },
  died: { paddingBottom: 8 },
  error: { fontFamily: font.regular, fontSize: 15 },
});
