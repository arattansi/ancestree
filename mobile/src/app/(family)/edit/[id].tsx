import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import {
  birthPlaceLabel,
  entryEditOf,
  entryEditProblems,
  type EntryEdit,
  type EntryRow,
  type PlaceChanges,
  type PlaceChoice,
} from "@/lib/entry-edit";
import { personDisplayName } from "@/lib/person-name";
import { SEX_VALUES, type Sex } from "@/lib/person-labels";
import { useFamily } from "@/family/family";
import { DateField } from "@/person/date-field";
import { readEntry, saveEntry } from "@/person/edit";
import { PlaceField } from "@/person/place-field";
import { detailsChanged } from "@/person/sheet";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
import { SheetForm } from "@/ui/sheet-keyboard";
import { TextField } from "@/ui/text-field";

const SEX_CHIPS: Record<Sex, string> = {
  male: "male",
  female: "female",
  undisclosed: "prefer not to disclose",
};

type Read =
  | { at: "reading" }
  | { at: "ready"; row: EntryRow }
  | { at: "not-yours" }
  | { at: "failed"; error: string };

/**
 * Edit a leaf's details (Step 203): the member's own, or one they own, from
 * Settings. Their names, sex, birth, death and where they live, with the
 * web's rules (`lib/entry-edit.ts`); a photo, email and connections are
 * changed on the web.
 */
export default function EditLeaf() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [read, setRead] = React.useState<Read>({ at: "reading" });

  React.useEffect(() => {
    let live = true;
    readEntry(id)
      .then((row) => live && setRead(row ? { at: "ready", row } : { at: "not-yours" }))
      .catch((error: unknown) =>
        live &&
        setRead({
          at: "failed",
          error: error instanceof Error ? error.message : "Couldn't read their details.",
        }),
      );
    return () => {
      live = false;
    };
  }, [id]);

  if (read.at === "ready") return <Form row={read.row} />;
  return (
    <View style={styles.centre}>
      {read.at === "reading" ? (
        <ActivityIndicator color={palette.green} />
      ) : (
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          {read.at === "failed" ? read.error : "Only someone who looks after this entry can change it."}
        </Text>
      )}
    </View>
  );
}

function Form({ row }: { row: EntryRow }) {
  const palette = usePalette();
  const { state, reload } = useFamily();
  const selfId = state.status === "ready" ? state.family.selfId : null;
  const own = row.id === selfId;
  const [edit, setEdit] = React.useState<EntryEdit>(() => entryEditOf(row));
  const [places, setPlaces] = React.useState<PlaceChanges>({});
  /** Which places have a name typed and nothing picked yet. */
  const [picking, setPicking] = React.useState<Partial<Record<keyof PlaceChanges, boolean>>>({});
  const pickingIn = React.useMemo(() => {
    const one = (kind: keyof PlaceChanges) => (on: boolean) =>
      setPicking((p) => (!!p[kind] === on ? p : { ...p, [kind]: on }));
    return { birth: one("birth"), death: one("death"), residence: one("residence") };
  }, []);
  const [checked, setChecked] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const problems = checked ? entryEditProblems(edit) : {};
  const set = <K extends keyof EntryEdit>(key: K) => (value: EntryEdit[K]) =>
    setEdit((e) => ({ ...e, [key]: value }));
  const place = (kind: keyof PlaceChanges) => (choice: PlaceChoice) =>
    setPlaces((p) => ({ ...p, [kind]: choice }));
  const shown = (kind: keyof PlaceChanges, stored: string) => {
    const choice = places[kind];
    return choice === undefined ? stored : (choice?.label ?? "");
  };

  async function save() {
    setChecked(true);
    if (Object.keys(entryEditProblems(edit)).length) {
      return setError("Check the details above.");
    }
    if (picking.birth || (edit.died ? picking.death : picking.residence)) {
      return setError("Pick the place from the list, or clear it.");
    }
    setSaving(true);
    setError(null);
    try {
      const why = await saveEntry(row.id, edit, places);
      if (why) return setError(why);
      detailsChanged();
      reload();
      router.back();
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetForm style={styles.fill} contentContainerStyle={styles.body}>
      <Text style={[styles.heading, { color: palette.foreground }]}>
        {own ? "Your leaf" : personDisplayName(row)}
      </Text>
      <View style={styles.pair}>
        <View style={styles.half}>
          <TextField
            label="First name"
            value={edit.firstName}
            onChangeText={set("firstName")}
            maxLength={120}
            autoCapitalize="words"
            error={problems.name}
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Last name"
            value={edit.lastName}
            onChangeText={set("lastName")}
            maxLength={120}
            autoCapitalize="words"
            error={problems.lastName}
          />
        </View>
      </View>
      <View style={styles.pair}>
        <View style={styles.half}>
          <TextField
            label="Middle name"
            value={edit.middleName}
            onChangeText={set("middleName")}
            maxLength={120}
            autoCapitalize="words"
          />
        </View>
        <View style={styles.half}>
          <TextField
            label="Preferred name"
            value={edit.preferredName}
            onChangeText={set("preferredName")}
            maxLength={120}
            autoCapitalize="words"
          />
        </View>
      </View>
      <TextField
        label="Maiden name"
        value={edit.maidenName}
        onChangeText={set("maidenName")}
        maxLength={120}
        autoCapitalize="words"
      />
      <View style={styles.choice}>
        <Text style={[styles.label, { color: palette.foreground }]}>Sex</Text>
        <View style={styles.chips}>
          {SEX_VALUES.map((sex) => (
            <Chip
              key={sex}
              label={SEX_CHIPS[sex]}
              on={edit.sex === sex}
              onPress={() => set("sex")(edit.sex === sex ? null : sex)}
            />
          ))}
        </View>
      </View>
      <DateField
        label="Date of birth"
        value={edit.born}
        onChange={set("born")}
        circa={edit.bornCirca}
        onCircaChange={set("bornCirca")}
        error={problems.born}
      />
      <PlaceField
        label="Place of birth"
        shown={shown("birth", birthPlaceLabel(row))}
        onChange={place("birth")}
        onPicking={pickingIn.birth}
      />
      {/* Your own leaf doesn't ask whether you've died. */}
      {own ? null : (
        <View style={styles.chips}>
          <Chip label="has died" on={edit.died} onPress={() => set("died")(!edit.died)} />
        </View>
      )}
      {edit.died ? (
        <>
          <DateField
            label="Date of death"
            value={edit.death}
            onChange={set("death")}
            circa={edit.deathCirca}
            onCircaChange={set("deathCirca")}
            error={problems.death}
          />
          <PlaceField
            label="Place of death"
            shown={shown("death", row.place_of_death ?? "")}
            onChange={place("death")}
            onPicking={pickingIn.death}
          />
        </>
      ) : (
        <PlaceField
          label="Lives in"
          shown={shown("residence", row.place_of_residence ?? "")}
          onChange={place("residence")}
          onPicking={pickingIn.residence}
        />
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.error, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}
      <Button label={saving ? "saving…" : "save"} disabled={saving} onPress={() => void save()} />
    </SheetForm>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: GUTTER + 4, paddingTop: 26, paddingBottom: 40, gap: 18 },
  centre: { flex: 1, alignItems: "center", justifyContent: "center", padding: GUTTER + 4 },
  heading: { fontFamily: font.semibold, fontSize: 22 },
  note: { fontFamily: font.regular, fontSize: 16, lineHeight: 22, textAlign: "center" },
  pair: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  choice: { gap: 8 },
  label: { fontFamily: font.medium, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  error: { fontFamily: font.regular, fontSize: 15 },
});
