import * as React from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { cardDay, signedYourCard, type BirthdayCardView } from "@/lib/birthday-cards";
import type { LeafShape } from "@/lib/leaf-shapes";
import { CardEnvelope } from "@/cards/envelope";
import { SignaturePage, type SignerWords } from "@/cards/pages";
import { font, GUTTER, usePalette } from "@/theme";
import { XIcon } from "@/ui/icons";

/**
 * A birthday card, opened on the phone (Step 217.4), over everything,
 * dimmed behind, as the web opens it: the person's first look starts at
 * the envelope, tied with twine; then a page a signature, each one's ink
 * writing itself out as the page turns to it. Anyone else, or the person
 * again, goes straight to the pages. `onFirstLook` runs as the envelope
 * opens.
 */
export function CardOpening({
  card,
  firstName,
  leaf,
  words,
  onClose,
  onFirstLook,
}: {
  card: BirthdayCardView;
  firstName: string;
  leaf: LeafShape;
  words: SignerWords;
  onClose: () => void;
  onFirstLook?: () => void;
}) {
  const { width } = useWindowDimensions();
  // The root's insets: a modal's own come back empty.
  const insets = useSafeAreaInsets();
  const [reading, setReading] = React.useState(!(card.recipient && !card.openedAt));
  const names = card.signatures.map((s) => s.name.split(" ")[0] || s.name);

  return (
    <Modal visible animationType="fade" presentationStyle="overFullScreen" transparent onRequestClose={onClose}>
      <View style={styles.dim}>
        <View style={[styles.fill, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="close"
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.close, pressed && { opacity: 0.7 }]}
          >
            <XIcon size={18} color="#ffffff" />
          </Pressable>
          {reading ? (
            <Pages card={card} firstName={firstName} words={words} width={width} onClose={onClose} />
          ) : (
            <View style={styles.sealed}>
              <View style={styles.greeting}>
                <Text style={styles.day}>{cardDay(card.opensOn)}</Text>
                <Text accessibilityRole="header" style={styles.happy}>
                  happy birthday, {firstName}.
                </Text>
              </View>
              <CardEnvelope
                firstName={firstName}
                leaf={leaf}
                count={card.signatures.length}
                width={Math.min(340, width - 2 * GUTTER)}
                onOpened={() => {
                  onFirstLook?.();
                  setReading(true);
                }}
              />
              <Text style={styles.signed}>{signedYourCard(names)}</Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

/** One page a signature, swiped or stepped through; the last one closes it. */
function Pages({
  card,
  firstName,
  words,
  width,
  onClose,
}: {
  card: BirthdayCardView;
  firstName: string;
  words: SignerWords;
  width: number;
  onClose: () => void;
}) {
  const palette = usePalette();
  const pager = React.useRef<ScrollView | null>(null);
  const [at, setAt] = React.useState(0);
  const count = card.signatures.length;
  const pageWidth = width - 2 * GUTTER;
  const go = (i: number) => {
    const next = Math.max(0, Math.min(count - 1, i));
    pager.current?.scrollTo({ x: next * width, animated: true });
    setAt(next);
  };
  const last = at >= count - 1;

  return (
    <View style={styles.fill}>
      <View style={styles.title}>
        <Text accessibilityRole="header" style={styles.heading}>
          {card.recipient ? "your birthday card" : `${firstName}’s birthday card`}
        </Text>
        <Text style={styles.sub}>
          {cardDay(card.opensOn)} {card.year} · {count === 1 ? "1 signature" : `${count} signatures`}
          {count > 1 ? ` · ${at + 1} of ${count}` : ""}
        </Text>
      </View>
      {count === 0 ? (
        <View style={[styles.sheet, { backgroundColor: palette.cakeSponge, marginHorizontal: GUTTER }]}>
          <Text style={[styles.empty, { color: palette.mutedForeground }]}>nobody has signed it yet.</Text>
        </View>
      ) : (
        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setAt(Math.round(e.nativeEvent.contentOffset.x / width))}
          style={styles.fill}
        >
          {card.signatures.map((s, i) => (
            <View key={s.id} style={{ width, paddingHorizontal: GUTTER }}>
              <ScrollView
                style={[styles.sheet, { backgroundColor: palette.cakeSponge, borderColor: palette.kraftLine }]}
                contentContainerStyle={styles.sheetBody}
              >
                {/* Mounted as it's turned to, so its ink writes itself out then. */}
                {Math.abs(i - at) <= 1 ? (
                  <SignaturePage
                    key={i === at ? "now" : "near"}
                    signature={s}
                    words={words}
                    width={pageWidth - 48}
                    replay={i === at}
                  />
                ) : null}
              </ScrollView>
            </View>
          ))}
        </ScrollView>
      )}
      <View style={styles.steps}>
        <Pressable
          accessibilityRole="button"
          disabled={at === 0}
          onPress={() => go(at - 1)}
          style={({ pressed }) => [styles.step, styles.stepOutline, (pressed || at === 0) && { opacity: at === 0 ? 0.4 : 0.7 }]}
        >
          <Text style={styles.stepOutlineText}>previous</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => (last ? onClose() : go(at + 1))}
          style={({ pressed }) => [styles.step, styles.stepSolid, pressed && { opacity: 0.8 }]}
        >
          <Text style={styles.stepSolidText}>{last ? "close" : "next"}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { flex: 1, backgroundColor: "#141414" },
  fill: { flex: 1 },
  close: {
    alignSelf: "flex-end",
    marginTop: 8,
    marginRight: GUTTER,
    zIndex: 2,
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  sealed: { flex: 1, alignItems: "center", justifyContent: "center", gap: 20, paddingHorizontal: GUTTER },
  greeting: { alignItems: "center", gap: 4 },
  day: { fontFamily: font.regular, fontSize: 14, color: "rgba(255,255,255,0.75)" },
  happy: { fontFamily: font.semibold, fontSize: 28, color: "#ffffff", textAlign: "center" },
  signed: { fontFamily: font.regular, fontSize: 15, color: "rgba(255,255,255,0.85)", textAlign: "center", maxWidth: 300 },
  title: { paddingHorizontal: GUTTER, paddingTop: 4, paddingBottom: 12, gap: 2 },
  heading: { fontFamily: font.semibold, fontSize: 22, color: "#ffffff" },
  sub: { fontFamily: font.regular, fontSize: 13, color: "rgba(255,255,255,0.75)" },
  sheet: { flex: 1, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth * 2 },
  sheetBody: { padding: 24 },
  empty: { fontFamily: font.regular, fontSize: 15, padding: 24 },
  steps: { flexDirection: "row", justifyContent: "space-between", gap: 12, padding: GUTTER },
  step: { height: 44, borderRadius: 10, paddingHorizontal: 18, alignItems: "center", justifyContent: "center" },
  stepOutline: { borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  stepOutlineText: { fontFamily: font.semibold, fontSize: 15, color: "#ffffff" },
  stepSolid: { backgroundColor: "#ffffff" },
  stepSolidText: { fontFamily: font.semibold, fontSize: 15, color: "#171717" },
});
