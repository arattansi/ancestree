import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CARD_MESSAGE_MAX,
  CARD_PHOTO_EDGE,
  CARD_THANKS_MAX,
  cardDay,
  moreSince,
  possessive,
  signedSoFar,
  type BirthdayCardView,
} from "@/lib/birthday-cards";
import { draftOf, inkOf, type InkDraft } from "@/lib/card-ink";
import { personDisplayName } from "@/lib/person-name";
import { CardError, signCard, takeOffSignature, thankEveryone, type Photo, type Voice } from "@/cards/cards";
import { InkPad } from "@/cards/ink";
import { SignaturePage, signerWords } from "@/cards/pages";
import { VoiceRecorder } from "@/cards/voice";
import { useFamily } from "@/family/family";
import { usePersonSheet } from "@/person/sheet";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";
import { ImagePlusIcon, PenLineIcon, XIcon } from "@/ui/icons";
import { SheetForm } from "@/ui/sheet-keyboard";
import { TextField } from "@/ui/text-field";

const firstOf = (name: string) => name.split(" ")[0] || name;

/**
 * Signing someone's birthday card on the phone (Step 217.4), as the web's
 * sheet signs it: a message, a name signed by hand in the strip under it, a
 * voice memo, a photo (shrunk to 1,600 points and re-saved on the phone, so
 * nothing of where it was taken goes with it) and a drawing, any of them;
 * then changing or taking it off until the day. Full screen, so a stroke
 * in a box never drags the screen away. Everyone else's so far underneath.
 * For the person, once their card is open, their thank-you to everyone
 * who signed it instead (Step 217.5): full screen too, so the keyboard
 * never covers it.
 */
export default function SignCardScreen() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const person = family?.people.get(id) ?? null;
  const sheet = usePersonSheet(person ? id : null);
  const card = sheet.state.status === "ready" ? (sheet.state.sheet.cards?.current ?? null) : null;

  // The root's insets: a full-screen modal's own come back empty on iOS 27.
  const insets = useSafeAreaInsets();
  const name = person ? personDisplayName(person) : "";
  const first = person?.preferred_name || person?.first_name || firstOf(name);

  return (
    <View
      style={[
        styles.fill,
        { backgroundColor: palette.background, paddingTop: insets.top, paddingBottom: insets.bottom },
      ]}
    >
      <View style={styles.top}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="close"
          onPress={() => router.back()}
          hitSlop={8}
          style={({ pressed }) => [styles.close, pressed && { opacity: 0.6 }]}
        >
          <XIcon size={22} color={palette.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={[styles.heading, { color: palette.foreground }]}>
          {card?.recipient ? "thank everyone" : `sign ${possessive(first)} card`}
        </Text>
      </View>
      {!family || !person ? null : sheet.state.status === "loading" ? (
        <ActivityIndicator color={palette.green} style={styles.loading} />
      ) : card?.recipient && card.isOpen && !card.closed ? (
        <ThankForm card={card} />
      ) : !card || card.isOpen || !card.signing ? (
        <View style={styles.closed}>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            {sheet.state.status === "failed" ? sheet.state.message : "This card isn’t open for you to sign."}
          </Text>
          {sheet.state.status === "failed" ? (
            <Button variant="outline" label="try again" onPress={sheet.reload} />
          ) : null}
        </View>
      ) : (
        <SignForm
          key={card.signatures.find((s) => s.mine)?.updatedAt ?? "new"}
          card={card}
          words={signerWords(family, first, false)}
        />
      )}
    </View>
  );
}

/**
 * The person's thank-you to everyone who signed (Step 217.5): their words
 * the first time; after that, the same words for anyone who signed since.
 */
function ThankForm({ card }: { card: BirthdayCardView }) {
  const palette = usePalette();
  const [message, setMessage] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const again = card.thanks !== null;

  async function send() {
    setError(null);
    setBusy(true);
    try {
      await thankEveryone(card.id, again ? "" : message);
      router.back();
    } catch (e) {
      setError(e instanceof CardError ? e.message : "Couldn’t send it. Try again.");
      setBusy(false);
    }
  }

  return (
    <SheetForm style={styles.fill} contentContainerStyle={styles.body}>
      {again ? (
        <>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>you thanked everyone.</Text>
          <Text style={[styles.thanks, { color: palette.foreground }]}>“{card.thanks}”</Text>
          <Text style={[styles.note, { color: palette.mutedForeground }]}>
            {card.unthanked > 0 ? moreSince(card.unthanked) : "everyone who signed has been thanked."}
          </Text>
        </>
      ) : (
        <TextField
          label="your thank-you"
          value={message}
          onChangeText={setMessage}
          maxLength={CARD_THANKS_MAX}
          multiline
          editable={!busy}
          autoFocus
          style={styles.message}
        />
      )}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}
      <Button
        label={busy ? "sending…" : again ? "thank them too" : "send to everyone"}
        busy={busy}
        disabled={again ? card.unthanked === 0 : !message.trim()}
        onPress={send}
      />
    </SheetForm>
  );
}

function SignForm({
  card,
  words,
}: {
  card: BirthdayCardView;
  words: ReturnType<typeof signerWords>;
}) {
  const palette = usePalette();
  const { width } = useWindowDimensions();
  const mine = card.signatures.find((s) => s.mine) ?? null;
  const others = card.signatures.filter((s) => !s.mine);
  const [message, setMessage] = React.useState(mine?.message ?? "");
  const [voice, setVoice] = React.useState<Voice | null>(
    mine?.audioPath ? { kind: "kept", path: mine.audioPath, seconds: mine.audioSeconds, url: mine.audioUrl } : null,
  );
  const [photo, setPhoto] = React.useState<Photo | null>(
    mine?.photoPath ? { kind: "kept", path: mine.photoPath, url: mine.photoUrl } : null,
  );
  const [ink, setInk] = React.useState<InkDraft>(() => draftOf(mine?.ink));
  const [drawingOpen, setDrawingOpen] = React.useState(!!mine?.ink?.draw);
  const [drawing, setDrawing] = React.useState(false);
  const [busy, setBusy] = React.useState<"sign" | "off" | "photo" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const empty = !message.trim() && !voice && !photo && !inkOf(ink);

  async function pickPhoto() {
    setError(null);
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 1,
      preferredAssetRepresentationMode:
        ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Compatible,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    setBusy("photo");
    try {
      // Re-drawn and saved anew: no EXIF, no place it was taken.
      const context = ImageManipulator.ImageManipulator.manipulate(asset.uri);
      if (Math.max(asset.width, asset.height) > CARD_PHOTO_EDGE) {
        context.resize(asset.width >= asset.height ? { width: CARD_PHOTO_EDGE } : { height: CARD_PHOTO_EDGE });
      }
      const image = await context.renderAsync();
      const saved = await image.saveAsync({ compress: 0.82, format: ImageManipulator.SaveFormat.JPEG });
      setPhoto({ kind: "new", uri: saved.uri });
    } catch {
      setError("That photo can’t be used. Try another.");
    } finally {
      setBusy(null);
    }
  }

  async function sign() {
    setError(null);
    setBusy("sign");
    try {
      await signCard({ cardId: card.id, message, voice, photo, ink: inkOf(ink) });
      router.back();
    } catch (e) {
      setError(e instanceof CardError ? e.message : "Couldn’t sign it. Try again.");
      setBusy(null);
    }
  }

  function takeOff() {
    if (!mine) return;
    Alert.alert("Take your signature off?", "Your message, voice memo, photo and drawing go with it.", [
      { text: "cancel", style: "cancel" },
      {
        text: "take it off",
        style: "destructive",
        onPress: () => {
          setBusy("off");
          takeOffSignature(mine.id)
            .then(() => router.back())
            .catch((e: unknown) => {
              setError(e instanceof CardError ? e.message : "Couldn’t take it off. Try again.");
              setBusy(null);
            });
        },
      },
    ]);
  }

  const off = busy !== null;
  return (
    <SheetForm style={styles.fill} contentContainerStyle={styles.body} scrollEnabled={!drawing}>
      <Text style={[styles.note, { color: palette.mutedForeground }]}>
        the card opens on {cardDay(card.opensOn)}. {firstOf(card.startedBy)} is collecting.
      </Text>

      <TextField
        label="message"
        value={message}
        onChangeText={setMessage}
        maxLength={CARD_MESSAGE_MAX}
        multiline
        editable={!off}
        style={styles.message}
      />

      <View style={styles.part}>
        <Text style={[styles.label, { color: palette.foreground }]}>sign your name</Text>
        <InkPad
          box="sign"
          value={ink.sign}
          onChange={(sign) => setInk((d) => ({ ...d, sign }))}
          onDrawing={setDrawing}
          disabled={off}
          label="your signature"
        />
      </View>

      <VoiceRecorder value={voice} onChange={setVoice} disabled={off} />

      {photo ? (
        <View style={styles.photoRow}>
          {(photo.kind === "new" ? photo.uri : photo.url) ? (
            <Image
              source={{ uri: photo.kind === "new" ? photo.uri : photo.url! }}
              accessibilityLabel="your photo"
              resizeMode="contain"
              style={[styles.photo, { backgroundColor: palette.muted }]}
            />
          ) : (
            <Text style={[styles.note, { color: palette.foreground }]}>photo</Text>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="remove photo"
            disabled={off}
            hitSlop={8}
            onPress={() => setPhoto(null)}
            style={({ pressed }) => [styles.remove, pressed && { opacity: 0.6 }]}
          >
            <XIcon size={18} color={palette.foreground} />
          </Pressable>
        </View>
      ) : (
        <Choice label="add a photo" busy={busy === "photo"} disabled={off} onPress={() => void pickPhoto()}>
          <ImagePlusIcon size={18} color={palette.foreground} />
        </Choice>
      )}

      {drawingOpen ? (
        <View style={styles.part}>
          <Text style={[styles.label, { color: palette.foreground }]}>your drawing</Text>
          <InkPad
            box="draw"
            value={ink.draw}
            onChange={(draw) => setInk((d) => ({ ...d, draw }))}
            onDrawing={setDrawing}
            disabled={off}
            label="your drawing"
          />
        </View>
      ) : (
        <Choice label="draw something" disabled={off} onPress={() => setDrawingOpen(true)}>
          <PenLineIcon size={18} color={palette.foreground} />
        </Choice>
      )}

      {error ? (
        <Text accessibilityLiveRegion="polite" style={[styles.note, { color: palette.destructive }]}>
          {error}
        </Text>
      ) : null}
      <Button
        label={busy === "sign" ? "signing…" : mine ? "save changes" : "sign card"}
        busy={busy === "sign"}
        disabled={off || empty}
        onPress={() => void sign()}
      />
      {mine ? <Button variant="link" label="take it off" disabled={off} onPress={takeOff} /> : null}

      <View style={styles.others}>
        <Text style={[styles.note, { color: palette.mutedForeground }]}>
          {signedSoFar(others.map((s) => firstOf(s.name)))}.
        </Text>
        {others.length > 0 ? (
          <Button
            variant="link"
            label={showAll ? "hide them" : "see them"}
            onPress={() => setShowAll((v) => !v)}
          />
        ) : null}
        {showAll
          ? others.map((s) => (
              <View
                key={s.id}
                style={[styles.signed, { borderColor: palette.kraftLine, backgroundColor: palette.cakeSponge }]}
              >
                <SignaturePage signature={s} words={words} width={width - 2 * (GUTTER + 4) - 32} />
              </View>
            ))
          : null}
      </View>
    </SheetForm>
  );
}

/** An outlined choice with its icon: add a photo, draw something. */
function Choice({
  label,
  busy = false,
  disabled,
  onPress,
  children,
}: {
  label: string;
  busy?: boolean;
  disabled: boolean;
  onPress: () => void;
  children: React.ReactNode;
}) {
  const palette = usePalette();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        { borderColor: palette.border },
        (pressed || disabled) && { opacity: disabled ? 0.5 : 0.7 },
      ]}
    >
      {busy ? <ActivityIndicator color={palette.foreground} /> : children}
      <Text style={[styles.choiceText, { color: palette.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  top: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: GUTTER, paddingTop: 8 },
  close: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  heading: { flex: 1, fontFamily: font.semibold, fontSize: 20 },
  loading: { marginTop: 40 },
  closed: { padding: GUTTER + 4, gap: 16 },
  body: { padding: GUTTER + 4, paddingTop: 8, gap: 18, paddingBottom: 48 },
  note: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  thanks: { fontFamily: font.regular, fontSize: 17, lineHeight: 25 },
  label: { fontFamily: font.medium, fontSize: 14 },
  message: { minHeight: 110, paddingTop: 12, textAlignVertical: "top" },
  part: { gap: 6 },
  photoRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  photo: { width: 160, height: 160, borderRadius: 10 },
  remove: { padding: 6 },
  choice: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 8,
    height: 44,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderRadius: 10,
  },
  choiceText: { fontFamily: font.semibold, fontSize: 15 },
  others: { gap: 10, marginTop: 8 },
  signed: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: 12, padding: 16 },
});
