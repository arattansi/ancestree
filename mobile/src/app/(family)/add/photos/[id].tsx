import { randomUUID } from "expo-crypto";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import { Image, ScrollView, StyleSheet, Text, View } from "react-native";

import { ALBUM_DESCRIPTION_MAX } from "@/lib/limits";
import { PHOTO_EXTENSIONS } from "@/lib/photo-path";
import { personDisplayName } from "@/lib/person-name";
import { supabase } from "@/auth/supabase";
import { useFamily } from "@/family/family";
import { detailsChanged } from "@/person/sheet";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { SheetKeyboardAvoidingView } from "@/ui/sheet-keyboard";
import { TextField } from "@/ui/text-field";

/** As many as the web's album dialog takes at once. */
const AT_ONCE = 10;
const THUMB = 96;

type Picked = { uri: string; type: string };

/**
 * Photos of someone (Step 179.3), from the + menu: picked from the phone's
 * library, each uploaded to the album under the tree it's added on and
 * added with `add_album_photo`, as the web's album dialog does (Step 88.5),
 * with them in it and one description for the lot. Refused, a photo's
 * upload is taken away again, as on the web.
 */
export default function AddPhotos() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  const person = state.status === "ready" ? state.family.people.get(id) : null;
  const [picked, setPicked] = React.useState<Picked[]>([]);
  const [description, setDescription] = React.useState("");
  const [sending, setSending] = React.useState<number | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState<{ added: number; pending: number } | null>(null);
  if (!person) return null;
  const name = personDisplayName(person);
  const treeId = person.fullOn[0] ?? null;

  async function choose() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsMultipleSelection: true,
      selectionLimit: AT_ONCE,
      quality: 0.85,
      // JPEG, not HEIC: the album takes JPEG, PNG and WebP.
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled) return;
    setPicked(
      result.assets.slice(0, AT_ONCE).map((a) => ({
        uri: a.uri,
        type: a.mimeType && PHOTO_EXTENSIONS[a.mimeType] ? a.mimeType : "image/jpeg",
      })),
    );
  }

  async function send() {
    if (!treeId || picked.length === 0) return;
    setError(null);
    let added = 0;
    let pending = 0;
    for (const [i, photo] of picked.entries()) {
      setSending(i + 1);
      const said = await addOne(photo, treeId, person!.id, description.trim());
      if ("error" in said) {
        setSending(null);
        // Those already added stay; what's left can be sent again.
        setPicked(picked.slice(i));
        setError(added ? `${added} added. ${said.error}` : said.error);
        return;
      }
      added += 1;
      pending += said.pending;
    }
    setSending(null);
    detailsChanged();
    setDone({ added, pending });
  }

  if (done) {
    return (
      <View style={styles.body}>
        <Text style={[styles.heading, { color: palette.foreground }]}>
          {done.pending ? "Sent for approval" : "Added"}
        </Text>
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          {done.added === 1
            ? done.pending
              ? `It shows in ${name}'s album once it's approved.`
              : `It's in ${name}'s album.`
            : done.pending
              ? `They show in ${name}'s album once they're approved.`
              : `They're in ${name}'s album.`}
        </Text>
        <Button label="done" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <SheetKeyboardAvoidingView style={styles.fill}>
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={[styles.heading, { color: palette.foreground }]}>Photos of {name}</Text>
        {!treeId ? (
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            Photos of {name} are added on their own tree.
          </Text>
        ) : picked.length === 0 ? (
          <Button label="choose photos" onPress={() => void choose()} />
        ) : (
          <>
            <View style={styles.grid}>
              {picked.map((p) => (
                <Image
                  key={p.uri}
                  source={{ uri: p.uri }}
                  style={[styles.thumb, { backgroundColor: palette.muted }]}
                  accessible={false}
                />
              ))}
            </View>
            <TextField
              label="Description"
              value={description}
              onChangeText={setDescription}
              maxLength={ALBUM_DESCRIPTION_MAX}
              multiline
            />
            {error ? <Text style={[styles.error, { color: palette.destructive }]}>{error}</Text> : null}
            <Button
              label={sending ? `adding ${sending} of ${picked.length}…` : picked.length === 1 ? "add it" : `add ${picked.length}`}
              disabled={sending !== null}
              onPress={() => void send()}
            />
            <Button variant="outline" label="choose others" disabled={sending !== null} onPress={() => void choose()} />
          </>
        )}
      </ScrollView>
    </SheetKeyboardAvoidingView>
  );
}

/** One photo up to the album and onto the tree, else why not. */
async function addOne(
  photo: Picked,
  treeId: string,
  personId: string,
  description: string,
): Promise<{ pending: number } | { error: string }> {
  const NOT_SENT = "A photo didn’t upload.";
  const ext = PHOTO_EXTENSIONS[photo.type];
  if (!ext) return { error: NOT_SENT };
  const path = `${treeId}/${randomUUID()}.${ext}`;
  let body: ArrayBuffer;
  try {
    body = await fetch(photo.uri).then((r) => r.arrayBuffer());
  } catch {
    return { error: NOT_SENT };
  }
  const { error: upload } = await supabase.storage
    .from("album")
    .upload(path, body, { contentType: photo.type, upsert: false });
  if (upload) return { error: NOT_SENT };
  const { data, error } = await supabase.rpc("add_album_photo", {
    p_tree: treeId,
    p_path: path,
    p_description: description,
    p_people: [personId],
  });
  if (error) {
    // Refused: the upload no photo took goes, as its uploader.
    await supabase.storage.from("album").remove([path]).catch(() => undefined);
    const said = error.message;
    return {
      error: said.includes("not on your tree")
        ? "They aren’t on this tree."
        : said.includes("longer than a description")
          ? `Keep the description under ${ALBUM_DESCRIPTION_MAX} characters.`
          : "Couldn’t add it. Try again.",
    };
  }
  return { pending: (data as { pending?: number } | null)?.pending ?? 0 };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: { padding: GUTTER + 4, paddingTop: 26, gap: 16 },
  heading: { fontFamily: font.semibold, fontSize: 22 },
  note: { fontFamily: font.regular, fontSize: 16, lineHeight: 22 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  thumb: { width: THUMB, height: THUMB, borderRadius: 10 },
  error: { fontFamily: font.regular, fontSize: 15 },
});
