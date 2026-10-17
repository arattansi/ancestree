import * as React from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { personDisplayName, personHasDied } from "@/lib/person-name";
import { scribeBody, scribeBodyFits } from "@/lib/scribe";
import { factsDone, factWrites, type RelativeProposal } from "@/lib/scribe-facts";
import { relativesDone } from "@/lib/scribe-relatives";
import { nameList } from "@/lib/story-about";
import { relativesOf } from "@/family/family";
import type { Family, FamilyPerson } from "@/family/load";
import { detailsChanged } from "@/person/sheet";
import { FactsReview, type FactsState } from "@/scribe/facts-review";
import { PersonChooser } from "@/scribe/person-chooser";
import { tonguesHeard, type Tongue } from "@/scribe/speech";
import {
  discardRecording,
  findFacts,
  keepRecording,
  makeFacts,
  ScribeError,
  tagInStory,
  tellStory,
  writeUp,
} from "@/scribe/story";
import { LISTEN_MAX_SECONDS, useListening } from "@/scribe/use-listening";
import { useRelatives } from "@/scribe/use-relatives";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { Chip } from "@/ui/chip";
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
  | {
      at: "saved";
      status: "approved" | "pending";
      /** How the facts and relatives accepted with it went (Steps 148.2–148.3). */
      facts: string | null;
    };

const NO_RELATIVES: RelativeProposal[] = [];

/** Everyone `keep` lets through, `first` (where they are) ahead, then by name. */
function likeliestFirst(
  family: Family,
  first: string[],
  keep: (p: FamilyPerson) => boolean,
): FamilyPerson[] {
  const rank = (p: FamilyPerson) => {
    const i = first.indexOf(p.id);
    return i === -1 ? first.length : i;
  };
  return [...family.people.values()]
    .filter(keep)
    .sort(
      (a, b) =>
        rank(a) - rank(b) || personDisplayName(a).localeCompare(personDisplayName(b)),
    );
}

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
 *
 * While Claude writes it up it also reads it for facts (Step 148.2): what
 * it tells the tree comes under the write-up, each to tick or not, and
 * saving the story makes what was ticked, the relatives it names who
 * aren't on the tree added last (148.3).
 *
 * It may be about several people (Step 183), each of whom has it on their
 * leaf: the first leads, telling it on their tree, and whoever else it's
 * about is on that tree too.
 */
export function Scribe({
  family,
  personId,
  onClose,
}: {
  family: Family;
  /** Whose leaf the story is told on. */
  personId: string;
  /** `changed` when an accepted fact changed someone on the tree. */
  onClose: (changed?: boolean) => void;
}) {
  const palette = usePalette();
  const insets = useSafeAreaInsets();
  /**
   * Whom it's about (Steps 179.6, 183): the leaf it was opened on, until
   * the member says otherwise above the microphone or once it's written
   * up. The first leads.
   */
  const [about, setAbout] = React.useState<string[]>([personId]);
  const person = family.people.get(about[0]) ?? null;
  /** A title of the member's own, given before telling it; Claude's otherwise. */
  const [ownTitle, setOwnTitle] = React.useState("");
  /** Who's credited as asking; until picked, as `askersAtFirst`. */
  const [askers, setAskers] = React.useState<string[] | null>(null);
  /** It was told out loud, so whoever recorded someone else asked them. */
  const [spoken, setSpoken] = React.useState(false);
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
  const [facts, setFacts] = React.useState<FactsState | null>(null);
  const [accepted, setAccepted] = React.useState<ReadonlySet<string>>(new Set());
  const relatives = useRelatives(
    family,
    facts?.at === "found" ? facts.facts.relatives : NO_RELATIVES,
    person?.fullOn[0] ?? null,
  );
  /** Whether a fact or relative saved with the story changed the tree. */
  const changed = React.useRef(false);
  /** What was heard, to look for facts in again. */
  const told = React.useRef<{ heard: string; locale: string | null } | null>(null);
  const scroll = React.useRef<ScrollView>(null);
  /** The recording on its way up, which saving waits for. */
  const uploading = React.useRef<Promise<Kept> | null>(null);
  /** What it was recorded as, on the phone, to put up again if need be. */
  const heardFiles = React.useRef<string[]>([]);

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

  /**
   * Who can be credited on the tree it's told on (Step 179.6, anyone on
   * it): the leaf and the member first, then everyone else by name.
   */
  const creditable = React.useMemo(() => {
    if (!person || !treeId) return [] as FamilyPerson[];
    return likeliestFirst(
      family,
      [person.id, family.selfId],
      (p) => p.fullOn.includes(treeId) && p.placeholder_number == null,
    );
  }, [family, person, treeId]);
  /** Whom a story may be about: anyone a tree of the member's shows in full. */
  const aboutable = React.useMemo(
    () => likeliestFirst(family, [personId, family.selfId], (p) => p.fullOn.length > 0),
    [family, personId],
  );

  // Told by the leaf when they're alive to tell it, else by whoever's telling.
  const tellersAtFirst = React.useMemo(() => {
    if (!person || !self) return [];
    const teller =
      person.id !== self.id && !personHasDied(person) ? person : self;
    return creditable.some((p) => p.id === teller.id) ? [teller.id] : [];
  }, [person, self, creditable]);
  const tellers = picked ?? tellersAtFirst;
  // Whoever recorded someone else telling it asked them (Step 99); a typed
  // story has no one asking, unless the member says who.
  const askersAtFirst =
    spoken &&
    self &&
    !tellers.includes(self.id) &&
    creditable.some((p) => p.id === self.id)
      ? [self.id]
      : [];
  const interviewers = askers ?? askersAtFirst;

  /**
   * Whom it's about now, never nobody. Someone off the first one's tree
   * starts it afresh about them, as a story is told on one tree; a new first
   * has who told it and asked chosen again, on their tree.
   */
  function chooseAbout(ids: string[]) {
    if (ids.length === 0) return;
    const added = ids.find((id) => !about.includes(id));
    const onTree = (id: string) =>
      !!treeId && !!family.people.get(id)?.fullOn.includes(treeId);
    const next = added && !onTree(added) ? [added] : ids;
    if (next[0] !== about[0]) {
      setTellers(null);
      setAskers(null);
    }
    setAbout(next);
  }

  /** What the story tells the tree, looked for while it's written up. */
  async function lookForFacts(heard: string, heardIn: string | null) {
    if (!person) return;
    setFacts({ at: "looking" });
    try {
      const found = await findFacts({ personId: person.id, heard, locale: heardIn });
      setFacts({ at: "found", facts: found });
    } catch (error) {
      setFacts({
        at: "failed",
        error: error instanceof ScribeError ? error.message : "Couldn’t look for facts.",
      });
    }
  }

  /** Heard it all: Claude writes it up and reads it for facts at once. */
  function heardIt(heard: string, heardIn: string | null) {
    told.current = { heard, locale: heardIn };
    void lookForFacts(heard, heardIn);
    void writeItUp(heard, heardIn);
  }

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
        title: ownTitle.trim() || written.title,
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
    // The form comes back, with who told it and asked (Step 179.6).
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSpoken(true);
    heardFiles.current = recordings;
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
    heardIt(heard, locale);
  }

  function close() {
    listening.reset();
    // A recording no story took goes, once it's up.
    if (step.at !== "saved") {
      void (uploading.current ?? Promise.resolve(kept)).then(
        (recording) => recording && discardRecording(recording.path),
      );
    }
    onClose(changed.current);
  }

  if (!person) return null;
  const name = personDisplayName(person);
  const names = nameList(
    about.flatMap((id) => {
      const p = family.people.get(id);
      return p ? [personDisplayName(p)] : [];
    }),
  );
  // Someone it names may be in it too, on the tree it's told on (Steps
  // 116, 183).
  const mentions =
    facts?.at === "found" && treeId
      ? facts.facts.mentions.filter(
          (m) =>
            m.personId !== person.id &&
            family.people.get(m.personId)?.fullOn.includes(treeId),
        )
      : [];
  const toggle = (set: ReadonlySet<string>, key: string) => {
    const next = new Set(set);
    if (!next.delete(key)) next.add(key);
    return next;
  };

  async function save() {
    if (!draft || !person || !treeId || !self) return;
    const body = scribeBody(draft.story, draft.english);
    if (!draft.story.trim()) return setSaveError("Write the story.");
    if (!scribeBodyFits(body))
      return setSaveError("That’s longer than a story may be.");
    // A relative ticked to add is answered for before anything's saved.
    const waiting = relatives.problem();
    if (waiting) return setSaveError(waiting);
    setSaving(true);
    setSaveError(null);
    try {
      let recording = uploading.current ? await uploading.current : kept;
      // Kept in the folder of whom it was first about when they were done;
      // if they're not in it now, it goes up again for the first (Step 183).
      if (recording && !about.includes(recording.path.split("/")[0])) {
        const again = await keepRecording(person.id, heardFiles.current);
        void discardRecording(recording.path);
        recording = again;
        uploading.current = Promise.resolve(again);
        setKept(again);
      }
      const others = about.filter((id) => id !== person.id);
      const saved = await tellStory({
        personId: person.id,
        treeId,
        title: draft.title,
        story: draft.story,
        english: draft.english,
        recording,
        storytellers: tellers,
        interviewers,
        about: others,
      });
      // The story's told; then what was ticked, each on its own.
      const ticked =
        facts?.at === "found"
          ? facts.facts.facts.filter((f) => accepted.has(f.key))
          : [];
      const made = ticked.length
        ? await makeFacts(factWrites(ticked), draft.title)
        : [];
      // Then the relatives ticked, one after another, and those a Root
      // tagged put in the story with the rest it's about (148.5).
      const added = await relatives.addTicked();
      const toTag = added.filter((a) => a.id && a.tag);
      if (toTag.length) {
        const tagError = saved.id
          ? await tagInStory({
              id: saved.id,
              treeId,
              toldOn: saved.toldOn,
              storytellers: tellers,
              interviewers,
              about,
              add: toTag.map((a) => a.id!),
            }).catch(() => "Couldn’t tag them.")
          : "Couldn’t tag them.";
        for (const a of toTag) {
          if (tagError) a.tagError = tagError;
          else a.tagged = true;
        }
      }
      changed.current =
        made.some((m) => !m.error && m.way !== "suggest") ||
        added.some((a) => !a.error);
      detailsChanged();
      setStep({
        at: "saved",
        status: saved.status,
        facts:
          [factsDone(made), relativesDone(added)].filter(Boolean).join(" ") ||
          null,
      });
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

  /**
   * Before telling it (Aalim, Step 179.6): a title of their own and whom
   * it's about, both optional, which fold away while they talk and come
   * back, with who told it and asked, once they're done.
   */
  const before = (
    <View style={styles.before}>
      <TextField label="Title" value={ownTitle} onChangeText={setOwnTitle} maxLength={200} />
      <PersonChooser
        label="About"
        people={aboutable}
        chosen={about}
        onChange={chooseAbout}
        selfId={family.selfId}
      />
    </View>
  );
  const summary = [ownTitle.trim(), `About ${names}`].filter(Boolean).join(" · ");

  return (
    // The window's own insets: a full-screen modal on iOS 27 measures its
    // safe area as none, and the header ran under the status bar (179.6).
    <View
      style={[
        styles.safe,
        {
          backgroundColor: palette.background,
          paddingTop: insets.top,
          paddingBottom: insets.bottom,
        },
      ]}
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
          {listening.phase === "idle" ? (
            before
          ) : (
            <Text numberOfLines={1} style={[styles.summary, { color: palette.mutedForeground }]}>
              {summary}
            </Text>
          )}
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
                  ? `Tell a story about ${names}.`
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
                      // The form folds away while they talk (Step 179.6).
                      (LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut),
                      void listening.start(locale, namesNear(family, person.id)))
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
            {before}
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
              onPress={() => heardIt(typed.trim(), null)}
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
            <PersonChooser
              label="About"
              people={aboutable}
              chosen={about}
              onChange={chooseAbout}
              selfId={family.selfId}
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
              <>
                <PersonChooser
                  label="Storyteller"
                  people={creditable}
                  chosen={tellers}
                  onChange={setTellers}
                  selfId={family.selfId}
                />
                <PersonChooser
                  label="Interviewer"
                  people={creditable}
                  chosen={interviewers}
                  onChange={setAskers}
                  selfId={family.selfId}
                />
              </>
            ) : null}
            {facts ? (
              <FactsReview
                state={facts}
                onRetry={() => {
                  if (told.current) {
                    void lookForFacts(told.current.heard, told.current.locale);
                  }
                }}
                accepted={accepted}
                onToggleFact={(key) => setAccepted((a) => toggle(a, key))}
                mentions={mentions}
                about={about}
                onToggleMention={(id) =>
                  chooseAbout(about.includes(id) ? about.filter((x) => x !== id) : [...about, id])
                }
                relatives={relatives}
              />
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
          {step.facts ? (
            <Text style={[styles.note, { color: palette.mutedForeground }]}>
              {step.facts}
            </Text>
          ) : null}
          <Button label="done" onPress={() => onClose(changed.current)} />
        </View>
      ) : null}
    </View>
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
  before: { gap: 14, paddingTop: 4 },
  summary: { fontFamily: font.medium, fontSize: 15, textAlign: "center" },
  label: { fontFamily: font.medium, fontSize: 14 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
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
