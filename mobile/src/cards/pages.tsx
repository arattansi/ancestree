import * as React from "react";
import { Image, StyleSheet, Text, View } from "react-native";

import { type CardSignatureView, possessive } from "@/lib/birthday-cards";
import { relationWords } from "@/lib/card-links";
import { relationOf } from "@/lib/connection-path";
import type { Family } from "@/family/load";
import { InkDrawing, replayLength } from "@/cards/ink";
import { VoicePlayer } from "@/cards/voice";
import { font, usePalette } from "@/theme";

/** What a signer is to whoever reads the card: "you", "your husband", "her cousin". */
export type SignerWords = (signature: CardSignatureView) => string | null;

/**
 * Who each signer is, as the web's sheet says it: the member themself, what
 * their entry is to the member on the tree, else the words a link signer
 * gave, from the person's side.
 */
export function signerWords(family: Family, firstName: string, recipient: boolean): SignerWords {
  return (s) => {
    if (s.mine) return "you";
    if (s.personId && s.personId !== family.selfId && family.people.has(s.personId)) {
      const rel = relationOf(s.personId, family.selfId, family.people, family.lines);
      if (rel && "term" in rel) return `your ${rel.term.toLowerCase()}`;
    }
    return relationWords(s.relation, recipient ? "your" : possessive(firstName));
  };
}

/**
 * One signature, a page of the card (the web's `CardPage`): who signed,
 * their name signed by hand in the typed name's place, what they wrote,
 * their drawing, their voice memo and photo. With `replay`, as the card
 * opens, the ink writes itself out again: the name, then the drawing.
 */
export function SignaturePage({
  signature,
  words,
  width,
  replay = false,
}: {
  signature: CardSignatureView;
  words: SignerWords;
  /** Points across the page's text. */
  width: number;
  replay?: boolean;
}) {
  const palette = usePalette();
  const relation = words(signature);
  const signed = signature.ink?.sign ?? null;
  const drawn = signature.ink?.draw ?? null;
  return (
    <View style={styles.page}>
      <View style={styles.head}>
        <View style={[styles.initial, { backgroundColor: palette.kraft }]}>
          <Text style={[styles.initialText, { color: palette.foreground }]}>{signature.name.slice(0, 1)}</Text>
        </View>
        <View style={styles.who}>
          {signed ? (
            <InkDrawing box="sign" strokes={signed} width={Math.min(200, width - 56)} label={signature.name} replay={replay} />
          ) : (
            <Text style={[styles.name, { color: palette.foreground }]}>{signature.name}</Text>
          )}
          {relation ? <Text style={[styles.relation, { color: palette.mutedForeground }]}>{relation}</Text> : null}
        </View>
      </View>
      {signature.message ? (
        <Text style={[styles.message, { color: palette.foreground }]}>{signature.message}</Text>
      ) : null}
      {drawn ? (
        <InkDrawing
          box="draw"
          strokes={drawn}
          width={Math.min(288, width)}
          label={`${signature.name}’s drawing`}
          replay={replay}
          delay={replay && signed ? replayLength(signed) + 250 : 0}
        />
      ) : null}
      {signature.audioPath ? (
        <VoicePlayer
          url={signature.audioUrl}
          seconds={signature.audioSeconds}
          name={signature.mine ? "your" : possessive(signature.name)}
        />
      ) : null}
      {signature.photoPath ? (
        signature.photoUrl ? (
          <Image
            source={{ uri: signature.photoUrl }}
            accessibilityLabel={`${signature.name}’s photo`}
            resizeMode="contain"
            style={[styles.photo, { width, height: (width * 3) / 4 }]}
          />
        ) : (
          <Text style={[styles.relation, { color: palette.mutedForeground }]}>the photo couldn’t be loaded.</Text>
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { gap: 16 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  initial: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  initialText: { fontFamily: font.semibold, fontSize: 16 },
  who: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.semibold, fontSize: 16 },
  relation: { fontFamily: font.regular, fontSize: 13 },
  message: { fontFamily: font.regular, fontSize: 19, lineHeight: 28 },
  photo: { borderRadius: 8 },
});
