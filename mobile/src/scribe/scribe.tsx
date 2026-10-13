import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { personDisplayName, personHasDied } from "@/lib/person-name";
import { scribeBody, scribeBodyFits } from "@/lib/scribe";
import { relativesOf } from "@/family/family";
import type { Family, FamilyPerson } from "@/family/load";
import { tonguesHeard, type Tongue } from "@/scribe/speech";
import {
  discardRecording,
  keepRecording,
  ScribeError,
  tellStory,
  writeUp,
} from "@/scribe/story";
import { LISTEN_MAX_SECONDS, useListening } from "@/scribe/use-listening";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { MicIcon, PauseIcon, XIcon } from "@/ui/icons";
import { TextField } from "@/ui/text-field";

type Draft = {
  title: string;
  story: string;
  english: string | null;
  language: string;
};
type Kept = { path: string; seconds: number | null } | null;

type Step =
  | { at: "tell" }
  | { at: "writing"; heard: string; locale: string | null; error?: string }
  | { at: "review" }
  | { at: "saved"; status: "approved" | "pending" };

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

/** The names the recognizer should know: the leaf's, their family's, the teller's. */
function namesNear(family: Family, id: string): string[] {
  const near = relativesOf(family, id);
  const ids = [
    id,
    family.selfId,
    ...near.parents,
    ...near.children,
    ...near.spouses,
    ...near.siblings,
  ];
  const names = new Set<string>();
  for (const pid of ids) {
    const p = family.people.get(pid);
    if (!p || p.placeholder_number != null) continue;
    names.add(personDisplayName(p));
    if (p.first_name) names.add(p.first_name);
  }
  return [...names];
}

/**
 * The scribe (Step 148): tell a story about someone out loud and Claude
 * writes it up, in the language it was told in with English under it; read
 * it over, then it's told on their tree like any story, recording and all.
 * Where the app can't listen (Expo Go), it takes typed words, or the
 * keyboard's own dictation, instead.
 */
export function Scribe({
  family,
  personId,
  onClose,
}: {
  family: Family;
  /** Whose leaf the story is told on. */
  personId: string;
  onClose: () => void;
}) {
  const palette = usePalette();
  const person = family.people.get(personId) ?? null;
  const listening = useListening({
    onDone: (heard, recordings) => heardAll(heard, recordings),
  });

  const [tongues, setTongues] = React.useState<(Tongue & { locale: string })[]>(
    [],
  );
  const [locale, setLocale] = React.useState<string | null>(null);
  const [typed, setTyped] = React.useState("");
  const [step, setStep] = React.useState<Step>({ at: "tell" });
  const [draft, setDraft] = React.useState<Draft | null>(null);
  const [kept, setKept] = React.useState<Kept>(null);
  const [keptProblem, setKeptProblem] = React.useState<string | null>(null);
  /** Who's credited as telling it; until picked, as `tellersAtFirst`. */
  const [picked, setTellers] = React.useState<string[] | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const scroll = React.useRef<ScrollView>(null);
  /** The recording on its way up, which saving waits for. */
  const uploading = React.useRef<Promise<Kept> | null>(null);

  React.useEffect(() => {
    if (!listening.available) return;
    let live = true;
    void tonguesHeard().then((heard) => {
      if (!live) return;
      setTongues(heard);
      setLocale((l) => l ?? heard[0]?.locale ?? null);
    });
    return () => {
      live = false;
    };
  }, [listening.available]);

  const self = family.people.get(family.selfId) ?? null;
  const treeId = person?.fullOn[0] ?? null;
  const recorded = listening.available;

  /** Who can be credited on the tree it's told on: the leaf, and the member. */
  const creditable = React.useMemo(() => {
    if (!person || !treeId) return [] as FamilyPerson[];
    return [person, self].filter(
      (p, i, all): p is FamilyPerson =>
        !!p &&
        p.fullOn.includes(treeId) &&
        all.findIndex((q) => q?.id === p.id) === i,
    );
  }, [person, self, treeId]);

  // Told by the leaf when they're alive to tell it, else by whoever's telling.
  const tellersAtFirst = React.useMemo(() => {
    if (!person || !self) return [];
    const teller =
      person.id !== self.id && !personHasDied(person) ? person : self;
    return creditable.some((p) => p.id === teller.id) ? [teller.id] : [];
  }, [person, self, creditable]);
  const tellers = picked ?? tellersAtFirst;

  async function writeItUp(heard: string, heardIn: string | null) {
    if (!person) return;
    setStep({ at: "writing", heard, locale: heardIn });
    try {
      const written = await writeUp({
        personId: person.id,
        heard,
        locale: heardIn,
      });
      setDraft({
        title: written.title,
        story: written.story,
        english: written.english,
        language: written.language,
      });
      setStep({ at: "review" });
    } catch (error) {
      setStep({
        at: "writing",
        heard,
        locale: heardIn,
        error:
          error instanceof ScribeError
            ? error.message
            : "Couldn’t write it up. Try again.",
      });
    }
  }

  /** Done talking: the recording goes up while Claude writes. */
  function heardAll(heard: string, recordings: string[]) {
    if (!person) return;
    if (!heard) {
      listening.reset();
      return;
    }
    uploading.current = keepRecording(person.id, recordings)
      .then((recording) => {
        setKept(recording);
        return recording;
      })
      .catch((error: unknown) => {
        setKeptProblem(
          error instanceof ScribeError
            ? error.message
            : "The recording didn’t upload.",
        );
        return null;
      });
    void writeItUp(heard, locale);
  }

  function close() {
    listening.reset();
    // A recording no story took goes, once it's up.
    if (step.at !== "saved") {
      void (uploading.current ?? Promise.resolve(kept)).then(
        (recording) => recording && discardRecording(recording.path),
      );
    }
    onClose();
  }

  if (!person) return null;
  const name = personDisplayName(person);

  async function save() {
    if (!draft || !person || !treeId || !self) return;
    const body = scribeBody(draft.story, draft.english);
    if (!draft.story.trim()) return setSaveError("Write the story.");
    if (!scribeBodyFits(body))
      return setSaveError("That’s longer than a story may be.");
    setSaving(true);
    setSaveError(null);
    try {
      const recording = uploading.current ? await uploading.current : kept;
      const status = await tellStory({
        personId: person.id,
        treeId,
        title: draft.title,
        story: draft.story,
        english: draft.english,
        recording,
        storytellers: tellers,
        // Whoever recorded someone else telling it asked them (Step 99); a
        // typed story has no interviewer (Step 145).
        interviewers:
          recording &&
          !tellers.includes(self.id) &&
          creditable.some((p) => p.id === self.id)
            ? [self.id]
            : [],
      });
      setStep({ at: "saved", status });
    } catch (error) {
      setSaveError(
        error instanceof ScribeError
          ? error.message
          : "Couldn’t save it. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  const left = LISTEN_MAX_SECONDS - listening.seconds;
  const talking = ["starting", "listening", "pausing", "finishing"].includes(
    listening.phase,
  );
  /** Between one state and the next, the microphone waits. */
  const between = ["starting", "pausing", "finishing"].includes(
    listening.phase,
  );

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: palette.background }]}
    >
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={step.at === "saved" ? "Close" : "Discard"}
          onPress={close}
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <XIcon color={palette.foreground} />
        </Pressable>
        <Text
          numberOfLines={1}
          style={[styles.title, { color: palette.foreground }]}
        >
          {name}
        </Text>
      </View>

      {!treeId ? (
        <View style={styles.centre}>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            Stories about {name} are told on their own tree.
          </Text>
        </View>
      ) : step.at === "tell" && recorded ? (
        <View style={styles.tell}>
          {listening.phase === "idle" && tongues.length > 1 ? (
            <View style={styles.chips}>
              {tongues.map((t) => (
                <Chip
                  key={t.locale}
                  label={t.name}
                  on={t.locale === locale}
                  onPress={() => setLocale(t.locale)}
                />
              ))}
            </View>
          ) : null}
          <ScrollView
            ref={scroll}
            style={styles.heard}
            contentContainerStyle={styles.heardBody}
            onContentSizeChange={() =>
              scroll.current?.scrollToEnd({ animated: true })
            }
          >
            <Text
              style={[
                styles.heardText,
                {
                  color: listening.text
                    ? palette.foreground
                    : palette.mutedForeground,
                },
              ]}
            >
              {listening.text ||
                (listening.phase === "idle"
                  ? `Tell a story about ${name}.`
                  : "Listening…")}
            </Text>
          </ScrollView>
          {listening.problem ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.error, { color: palette.destructive }]}
            >
              {listening.problem}
            </Text>
          ) : null}
          <Text style={[styles.clock, { color: palette.mutedForeground }]}>
            {clock(listening.seconds)}
            {listening.phase !== "idle" && left <= 120
              ? ` · ${clock(Math.max(0, left))} left`
              : ""}
          </Text>
          <View style={styles.controls}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                listening.phase === "listening"
                  ? "Pause"
                  : listening.phase === "paused"
                    ? "Carry on"
                    : "Start"
              }
              disabled={!locale || between}
              onPress={() =>
                listening.phase === "listening"
                  ? listening.pause()
                  : listening.phase === "paused"
                    ? listening.resume()
                    : locale &&
                      void listening.start(locale, namesNear(family, person.id))
              }
              style={({ pressed }) => [
                styles.mic,
                {
                  backgroundColor:
                    listening.phase === "listening"
                      ? palette.destructive
                      : palette.primary,
                },
                (!locale || between) && { opacity: 0.5 },
                pressed && { opacity: 0.8 },
              ]}
            >
              {listening.phase === "listening" ? (
                <PauseIcon size={34} color={palette.primaryForeground} />
              ) : (
                <MicIcon size={34} color={palette.primaryForeground} />
              )}
            </Pressable>
            {talking || listening.phase === "paused" ? (
              <Button
                label="done"
                busy={listening.phase === "finishing"}
                onPress={listening.finish}
              />
            ) : null}
          </View>
        </View>
      ) : step.at === "tell" ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <TextField
              label="The story"
              value={typed}
              onChangeText={setTyped}
              multiline
              textAlignVertical="top"
              style={styles.long}
            />
            <Button
              label="write it up"
              disabled={!typed.trim()}
              onPress={() => void writeItUp(typed.trim(), null)}
            />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : step.at === "writing" ? (
        <View style={styles.centre}>
          {step.error ? (
            <>
              <Text style={[styles.error, { color: palette.destructive }]}>
                {step.error}
              </Text>
              <Button
                label="try again"
                onPress={() => void writeItUp(step.heard, step.locale)}
              />
            </>
          ) : (
            <>
              <ActivityIndicator color={palette.green} />
              <Text style={[styles.note, { color: palette.mutedForeground }]}>
                Writing it up…
              </Text>
            </>
          )}
        </View>
      ) : step.at === "review" && draft ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.form}
            keyboardShouldPersistTaps="handled"
          >
            <TextField
              label="Title"
              value={draft.title}
              onChangeText={(title) => setDraft({ ...draft, title })}
            />
            <TextField
              label={draft.english ? draft.language : "Story"}
              value={draft.story}
              onChangeText={(story) => setDraft({ ...draft, story })}
              multiline
              textAlignVertical="top"
              style={styles.long}
            />
            {draft.english != null ? (
              <TextField
                label="English"
                value={draft.english}
                onChangeText={(english) => setDraft({ ...draft, english })}
                multiline
                textAlignVertical="top"
                style={styles.long}
              />
            ) : null}
            {creditable.length ? (
              <View style={styles.credits}>
                <Text style={[styles.label, { color: palette.foreground }]}>
                  Storyteller
                </Text>
                <View style={styles.chips}>
                  {creditable.map((p) => (
                    <Chip
                      key={p.id}
                      label={p.id === self?.id ? "You" : personDisplayName(p)}
                      on={tellers.includes(p.id)}
                      onPress={() =>
                        setTellers(
                          tellers.includes(p.id)
                            ? tellers.filter((x) => x !== p.id)
                            : [...tellers, p.id],
                        )
                      }
                    />
                  ))}
                </View>
              </View>
            ) : null}
            {keptProblem ? (
              <Text style={[styles.note, { color: palette.mutedForeground }]}>
                {keptProblem}
              </Text>
            ) : null}
            {saveError ? (
              <Text
                accessibilityLiveRegion="polite"
                style={[styles.error, { color: palette.destructive }]}
              >
                {saveError}
              </Text>
            ) : null}
            <Button
              label="save story"
              busy={saving}
              onPress={() => void save()}
            />
            <Button variant="link" label="Discard" onPress={close} />
          </ScrollView>
        </KeyboardAvoidingView>
      ) : step.at === "saved" ? (
        <View style={styles.centre}>
          <Text style={[styles.done, { color: palette.foreground }]}>
            {step.status === "pending" ? "Sent for approval." : "Added."}
          </Text>
          <Button label="done" onPress={() => onClose()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Chip({
  label,
  on,
  onPress,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        on
          ? { backgroundColor: palette.primary, borderColor: palette.primary }
          : { borderColor: palette.border },
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text
        style={[
          styles.chipText,
          { color: on ? palette.primaryForeground : palette.foreground },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: GUTTER,
    paddingVertical: 8,
  },
  close: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontFamily: font.semibold, fontSize: 18 },
  tell: { flex: 1, paddingHorizontal: GUTTER + 8, paddingBottom: 24, gap: 12 },
  heard: { flex: 1 },
  heardBody: { paddingVertical: 8 },
  heardText: { fontFamily: font.regular, fontSize: 20, lineHeight: 30 },
  clock: {
    fontFamily: font.medium,
    fontSize: 15,
    textAlign: "center",
    fontVariant: ["tabular-nums"],
  },
  controls: { alignItems: "center", gap: 16 },
  mic: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  form: { padding: GUTTER + 8, gap: 18 },
  long: { minHeight: 200, paddingTop: 12, paddingBottom: 12, lineHeight: 24 },
  credits: { gap: 8 },
  label: { fontFamily: font.medium, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    justifyContent: "center",
  },
  chipText: { fontFamily: font.medium, fontSize: 15 },
  centre: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    padding: GUTTER + 8,
  },
  note: { fontFamily: font.regular, fontSize: 16, textAlign: "center" },
  error: { fontFamily: font.regular, fontSize: 15, textAlign: "center" },
  done: { fontFamily: font.semibold, fontSize: 20 },
});
