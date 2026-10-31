import { router } from "expo-router";
import * as React from "react";
import { Alert, StyleSheet, Text, View } from "react-native";

import {
  cardDay,
  moreSince,
  possessive,
  signedSoFar,
  signedYourCard,
  type PersonCards,
} from "@/lib/birthday-cards";
import { pronounOf } from "@/lib/card-links";
import type { LeafShape } from "@/lib/leaf-shapes";
import type { Family } from "@/family/load";
import { CardError, hideSignature, markOpened } from "@/cards/cards";
import { EnvelopeMark } from "@/cards/envelope";
import { CardOpening } from "@/cards/opening";
import { signerWords } from "@/cards/pages";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";

const firstOf = (name: string) => name.split(" ")[0] || name;

/**
 * Someone's birthday card on their details (Step 217.4), as the web's sheet
 * shows it: before the day, to whoever may sign it, who's collecting, who
 * has signed, and signing it or changing their signature; on the day and
 * after, the person opens theirs (the envelope first), thanks everyone and
 * hides a page from the others (Step 217.5), and its signers and managers
 * open it too, the thank-you with it once it reached them. A card whose
 * person died is closed. Starting a card and sending its links stay on the
 * web. Nothing for the person before the day: the database says nothing.
 * `openNow` opens it straight away, from a push or their leaf.
 */
export function CardSection({
  family,
  personId,
  name,
  sex,
  leaf,
  cards,
  openNow,
}: {
  family: Family;
  personId: string;
  name: string;
  sex: string | null;
  leaf: LeafShape;
  cards: PersonCards | undefined;
  openNow: boolean;
}) {
  const palette = usePalette();
  const current = cards?.current ?? null;
  const first = firstOf(name);
  const [tapped, setTapped] = React.useState(false);
  // Opened straight away (a push, their leaf) once, then only when tapped.
  const [shut, setShut] = React.useState(false);
  const [looked, setLooked] = React.useState(false);
  const [hiding, setHiding] = React.useState<string | null>(null);
  const words = React.useMemo(
    () => signerWords(family, first, current?.recipient ?? false),
    [family, first, current?.recipient],
  );

  if (!current) return null;
  const opening = tapped || (openNow && !shut && current.isOpen && !current.closed);
  const thank = () => router.push({ pathname: "/card/[id]", params: { id: personId } });
  const mine = current.signatures.find((s) => s.mine) ?? null;
  const others = current.signatures.filter((s) => !s.mine);

  return (
    <View style={[styles.card, { borderColor: palette.kraftLine, backgroundColor: palette.cakeSponge }]}>
      <View style={styles.head}>
        <EnvelopeMark />
        <View style={styles.headText}>
          {current.closed ? (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
                {possessive(first)} birthday card
              </Text>
              <Text style={[styles.line, { color: palette.mutedForeground }]}>the card is closed.</Text>
            </>
          ) : current.isOpen ? (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
                {current.recipient ? "your birthday card" : `${possessive(first)} birthday card`}
              </Text>
              <Text style={[styles.line, { color: palette.mutedForeground }]}>
                {current.recipient
                  ? signedYourCard(current.signatures.map((s) => firstOf(s.name)))
                  : `it opened on ${cardDay(current.opensOn)}.`}
              </Text>
            </>
          ) : (
            <>
              <Text accessibilityRole="header" style={[styles.title, { color: palette.foreground }]}>
                sign {possessive(first)} card
              </Text>
              <Text style={[styles.line, { color: palette.mutedForeground }]}>
                {pronounOf(sex)} birthday is on {cardDay(current.opensOn)}. {firstOf(current.startedBy)} is
                collecting.
              </Text>
            </>
          )}
        </View>
      </View>

      {current.closed ? (
        current.signatures.length > 0 ? (
          <Button variant="outline" label="open the card" onPress={() => setTapped(true)} />
        ) : null
      ) : current.isOpen ? (
        <>
          <Button
            label={current.recipient ? "open your card" : "open the card"}
            onPress={() => setTapped(true)}
          />
          {current.recipient && current.thanks === null && current.unthanked > 0 ? (
            <Button variant="outline" label="thank everyone" onPress={thank} />
          ) : null}
          {current.thanks !== null ? (
            <View style={[styles.thanks, { borderTopColor: palette.kraftLine }]}>
              {current.recipient ? (
                <Text style={[styles.line, { color: palette.mutedForeground }]}>you thanked everyone.</Text>
              ) : null}
              <Text style={[styles.quote, { color: palette.foreground }]}>“{current.thanks}”</Text>
              {current.recipient ? null : (
                <Text style={[styles.line, { color: palette.mutedForeground }]}>{possessive(first)} thank-you</Text>
              )}
              {current.recipient && current.unthanked > 0 ? (
                <>
                  <Text style={[styles.line, { color: palette.mutedForeground }]}>
                    {moreSince(current.unthanked)}
                  </Text>
                  <Button variant="outline" label="thank them too" onPress={thank} />
                </>
              ) : null}
            </View>
          ) : null}
        </>
      ) : (
        <>
          <Text style={[styles.line, { color: palette.mutedForeground }]}>
            {!mine
              ? `${signedSoFar(others.map((s) => firstOf(s.name)))}.`
              : others.length > 0
                ? `${signedSoFar(others.map((s) => firstOf(s.name)))}, and so have you.`
                : "you’ve signed it."}
          </Text>
          {current.signing ? (
            <Button
              variant={mine ? "outline" : "primary"}
              label={mine ? "change your signature" : "sign the card"}
              onPress={() => router.push({ pathname: "/card/[id]", params: { id: personId } })}
            />
          ) : (
            <Text style={[styles.line, { color: palette.mutedForeground }]}>signing has closed.</Text>
          )}
        </>
      )}

      {opening ? (
        <CardOpening
          card={looked && current.recipient ? { ...current, openedAt: new Date().toISOString() } : current}
          firstName={first}
          leaf={leaf}
          words={words}
          onClose={() => {
            setTapped(false);
            setShut(true);
          }}
          onFirstLook={() => {
            setLooked(true);
            void markOpened(current.id);
          }}
          hide={
            current.recipient
              ? {
                  pendingId: hiding,
                  onHide: (sig) => {
                    setHiding(sig.id);
                    hideSignature(sig.id, !sig.hidden)
                      .catch((e: unknown) =>
                        Alert.alert(e instanceof CardError ? e.message : "Couldn’t change it. Try again."),
                      )
                      .finally(() => setHiding(null));
                  },
                }
              : undefined
          }
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: GUTTER + 4,
    marginTop: 20,
    padding: 16,
    gap: 14,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
  },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontFamily: font.semibold, fontSize: 16 },
  line: { fontFamily: font.regular, fontSize: 14, lineHeight: 20 },
  thanks: { gap: 6, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth * 2 },
  quote: { fontFamily: font.regular, fontSize: 16, lineHeight: 23 },
});
