import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, View } from "react-native";

import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import { ScribeError, tellStory } from "@/scribe/story";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { TextField } from "@/ui/text-field";

/** As long as a story may be (Step 113). */
const STORY_MAX = 200_000;

/**
 * A story written about someone (Step 179.3), from the + menu: a title and
 * the story, told through `add_story` as the web's written stories are, and
 * waiting for approval where theirs would. Told out loud, it's the scribe.
 */
export default function WriteStory() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  const person = state.status === "ready" ? state.family.people.get(id) : null;
  const [title, setTitle] = React.useState("");
  const [story, setStory] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<"approved" | "pending" | null>(null);
  if (!person) return null;
  const name = personDisplayName(person);
  const treeId = person.fullOn[0] ?? null;

  if (done) {
    return (
      <View style={styles.body}>
        <Text style={[styles.heading, { color: palette.foreground }]}>
          {done === "pending" ? "Sent for approval" : "Added"}
        </Text>
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          {done === "pending"
            ? `It shows on ${name}'s leaf once it's approved.`
            : `It's on ${name}'s leaf.`}
        </Text>
        <Button label="done" onPress={() => router.back()} />
      </View>
    );
  }

  async function save() {
    if (!treeId) return;
    if (!title.trim()) return setError("Give it a title.");
    if (!story.trim()) return setError("Write the story.");
    setSaving(true);
    setError(null);
    try {
      const told = await tellStory({
        personId: person!.id,
        treeId,
        title,
        story: story.trim(),
        english: null,
        recording: null,
        storytellers: [],
        interviewers: [],
        mentions: [],
      });
      setDone(told.status);
    } catch (e) {
      setError(e instanceof ScribeError ? e.message : "Couldn’t save it. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: palette.foreground }]}>A story about {name}</Text>
        {treeId ? (
          <>
            <TextField label="Title" value={title} onChangeText={setTitle} maxLength={200} />
            <TextField
              label="Story"
              value={story}
              onChangeText={setStory}
              multiline
              maxLength={STORY_MAX}
              textAlignVertical="top"
              style={styles.story}
            />
            {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
            <Button label={saving ? "saving…" : "save"} disabled={saving} onPress={() => void save()} />
          </>
        ) : (
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            Stories about {name} are added on their own tree.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: GUTTER + 4, paddingTop: 26, gap: 16 },
  heading: { fontFamily: font.semibold, fontSize: 22 },
  note: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  story: { minHeight: 220, paddingTop: 12, lineHeight: 23 },
  error: { fontFamily: font.regular, fontSize: 15 },
});
