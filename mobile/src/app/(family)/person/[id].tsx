import { router, useLocalSearchParams } from "expo-router";
import * as React from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

import { connectionPath, relationOf } from "@/lib/connection-path";
import { leafLabel, nativeLeaf } from "@/lib/native-leaf";
import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import {
  maidenLine,
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import { relativesOf, useFamily } from "@/family/family";
import type { Family, FamilyPerson } from "@/family/load";
import { usePhotoUrl } from "@/family/photo";
import { GROUP_NAMES, relationWord } from "@/family/words";
import { messenger, useMessageTarget, useMessenger } from "@/messages/store";
import { ErrorText } from "@/messages/ui";
import { Album, Field, Reports, Section, Stories, Trees } from "@/person/sections";
import { usePersonSheet } from "@/person/sheet";
import { font, GUTTER, usePalette } from "@/theme";
import { Button } from "@/ui/button";

const FACE = 56;

/**
 * Someone's full details (Step 179.5), as the web's sheet shows them (Aalim:
 * "the full detailed view, not just the truncated version"): who they are
 * and how they're connected to the member, the trees they're on, their
 * dates and places, their family one line away, their album, their stories
 * and any open reports. From here: message them (Step 179.1), tell or add a
 * story, add a relative or photos (Step 179.3), or walk to their leaf.
 */
export default function PersonDetails() {
  const palette = usePalette();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state, walkTo } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const person = family?.people.get(id) ?? null;
  const self = !!family && family.selfId === id;
  const messageTo = useMessageTarget(self ? null : id);
  const opening = useMessenger((s) => s.opening);
  const [messageError, setMessageError] = React.useState<string | null>(null);
  const sheet = usePersonSheet(person ? id : null);
  const { width } = useWindowDimensions();
  const photo = usePhotoUrl(person?.photo_path, width);
  if (!family || !person) return null;

  async function message(userId: string) {
    setMessageError(null);
    const conversation = await messenger.openWith(userId);
    if (!conversation) {
      setMessageError("Couldn't open the conversation. Try again.");
      return;
    }
    // The details go, and the conversation opens over the leaf.
    if (router.canGoBack()) router.back();
    router.push({ pathname: "/messages/[id]", params: { id: conversation } });
  }

  /** To someone's leaf on the home screen. */
  const walk = (to: string) => {
    walkTo(to);
    if (router.canGoBack()) router.back();
    router.navigate("/");
  };

  const name = personDisplayName(person);
  const maiden = maidenLine(person);
  const years = [self ? "You" : null, personLifespan(person)].filter(Boolean).join(" · ");
  const deceased = !!person.is_deceased || !!person.date_of_death;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      {photo ? (
        <View style={[styles.hero, { width, height: (width * 3) / 4 }]}>
          <Image source={{ uri: photo }} style={StyleSheet.absoluteFill} accessible={false} />
          <View style={styles.scrim} />
          <View style={styles.heroText}>
            <Text style={[styles.name, styles.onPhoto]}>{name}</Text>
            {maiden ? <Text style={[styles.sub, styles.onPhotoMuted]}>{maiden}</Text> : null}
            {years ? <Text style={[styles.sub, styles.onPhotoMuted]}>{years}</Text> : null}
          </View>
        </View>
      ) : (
        <View style={styles.head}>
          <View style={[styles.face, { backgroundColor: palette.pillInk }]}>
            <Text style={[styles.faceText, { color: palette.pill }]}>{personInitials(person)}</Text>
          </View>
          <View style={styles.headText}>
            <Text style={[styles.name, { color: palette.foreground }]}>{name}</Text>
            {maiden ? <Text style={[styles.sub, { color: palette.mutedForeground }]}>{maiden}</Text> : null}
            {years ? <Text style={[styles.sub, { color: palette.mutedForeground }]}>{years}</Text> : null}
          </View>
        </View>
      )}

      <Connection family={family} person={person} onWalk={walk} />

      <Badges person={person} reports={sheet.state.status === "ready" ? (sheet.state.sheet.reports?.length ?? 0) : 0} deceased={deceased} />

      <View style={styles.actions}>
        {messageTo ? (
          <Button
            label="message"
            busy={opening === messageTo}
            onPress={() => void message(messageTo)}
          />
        ) : null}
        {messageError ? <ErrorText>{messageError}</ErrorText> : null}
        {person.fullOn.length ? (
          <View style={styles.pair}>
            <View style={styles.half}>
              <Button
                variant="outline"
                label="tell a story"
                onPress={() => router.push({ pathname: "/scribe/[id]", params: { id: person.id } })}
              />
            </View>
            <View style={styles.half}>
              <Button
                variant="outline"
                label="add"
                onPress={() => router.push({ pathname: "/add/[id]", params: { id: person.id } })}
              />
            </View>
          </View>
        ) : null}
        <Button variant="link" label="Go to their leaf" onPress={() => walk(person.id)} />
      </View>

      <Details person={person} />

      <FamilyRows family={family} person={person} onWalk={walk} />

      {sheet.state.status === "loading" ? (
        <ActivityIndicator color={palette.green} style={styles.loading} />
      ) : sheet.state.status === "failed" ? (
        <View style={styles.failed}>
          <Text style={[styles.sub, { color: palette.mutedForeground }]}>{sheet.state.message}</Text>
          <Button variant="outline" label="try again" onPress={sheet.reload} />
        </View>
      ) : (
        <>
          {sheet.state.sheet.trees?.length ? (
            <Section title="On">
              <Trees trees={sheet.state.sheet.trees} />
            </Section>
          ) : null}
          {sheet.state.sheet.album?.length ? (
            <Section title="Album">
              <Album photos={sheet.state.sheet.album} width={width - 2 * (GUTTER + 4)} />
            </Section>
          ) : null}
          <Section title="Stories">
            {sheet.state.sheet.stories?.length ? (
              <Stories stories={sheet.state.sheet.stories} />
            ) : (
              <Text style={[styles.sub, { color: palette.mutedForeground }]}>No stories yet.</Text>
            )}
          </Section>
          {sheet.state.sheet.reports?.length ? (
            <Section title="Reports">
              <Reports reports={sheet.state.sheet.reports} />
            </Section>
          ) : null}
        </>
      )}
    </ScrollView>
  );
}

/**
 * How they're connected to the member (Aalim: "how they are connected to
 * you"): what they are to them in a word, as the web's credit cards say it
 * (`relationOf`), and the chain of people between, each a step to walk to.
 */
function Connection({
  family,
  person,
  onWalk,
}: {
  family: Family;
  person: FamilyPerson;
  onWalk: (id: string) => void;
}) {
  const palette = usePalette();
  const { relation, chain } = React.useMemo(() => {
    if (person.id === family.selfId) return { relation: null, chain: [] as string[] };
    const rel = relationOf(person.id, family.selfId, family.people, family.lines);
    const path = connectionPath(family.selfId, person.id, family.lines);
    return { relation: rel, chain: path?.people ?? [] };
  }, [family, person.id]);
  if (person.id === family.selfId) return null;
  const words = !relation
    ? "Not connected to you on your trees"
    : "term" in relation
      ? `Your ${relation.term.toLowerCase()}`
      : `Connected to you through ${relation.through} ${relation.through === 1 ? "person" : "people"}`;
  return (
    <View style={styles.connection}>
      <Text style={[styles.relation, { color: palette.foreground }]}>{words}</Text>
      {chain.length > 2 ? (
        <View style={styles.chain}>
          {chain.map((pid, i) => {
            const p = family.people.get(pid);
            const label = pid === family.selfId ? "You" : p ? (p.preferred_name || p.first_name || personDisplayName(p)) : "";
            return (
              <React.Fragment key={pid}>
                {i > 0 ? <Text style={[styles.arrow, { color: palette.mutedForeground }]}>→</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Go to ${label}'s leaf`}
                  onPress={() => onWalk(pid)}
                  style={({ pressed }) => [
                    styles.step,
                    { backgroundColor: palette.pill, borderColor: palette.pillBorder },
                    pressed && { opacity: 0.6 },
                  ]}
                >
                  <Text style={[styles.stepText, { color: palette.foreground }]}>{label}</Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function Badges({
  person,
  reports,
  deceased,
}: {
  person: FamilyPerson;
  reports: number;
  deceased: boolean;
}) {
  const palette = usePalette();
  const badges = [
    deceased ? "Deceased" : null,
    person.basic ? "Basic card" : null,
    reports ? `${reports} report${reports === 1 ? "" : "s"}` : null,
  ].filter((b): b is string => !!b);
  if (badges.length === 0) return null;
  return (
    <View style={styles.badges}>
      {badges.map((b) => (
        <Text
          key={b}
          style={[styles.badge, { color: palette.foreground, borderColor: palette.border, backgroundColor: palette.muted }]}
        >
          {b}
        </Text>
      ))}
    </View>
  );
}

function Details({ person }: { person: FamilyPerson }) {
  const born = formatPartialDate(
    person.date_of_birth,
    person.date_of_birth_precision,
    asDayMonth(person.birth_month, person.birth_day),
    person.date_of_birth_circa,
  );
  const died = formatPartialDate(
    person.date_of_death,
    person.date_of_death_precision,
    null,
    person.date_of_death_circa,
  );
  const birthplace =
    [person.city_of_birth, person.country_of_birth].filter(Boolean).join(", ") || null;
  const names = [
    person.first_name,
    person.middle_name,
    person.last_name,
  ]
    .filter(Boolean)
    .join(" ");
  const rows: [string, string | null][] = [
    ["Full name", person.placeholder_number != null ? null : names || null],
    ["Goes by", person.preferred_name && person.preferred_name !== person.first_name ? person.preferred_name : null],
    ["Maiden name", person.maiden_name],
    ["Born", born],
    ["Birthplace", birthplace],
    ["Lives in", person.is_deceased ? null : person.place_of_residence],
    ["Died", died ?? (person.is_deceased ? "Deceased" : null)],
    ["Place of death", person.place_of_death],
    ["Leaf", leafLabel(nativeLeaf(person))],
  ];
  const shown = rows.filter((r): r is [string, string] => !!r[1]);
  return (
    <Section title="Details">
      <View style={styles.fields}>
        {shown.map(([label, value]) => (
          <View key={label} style={styles.fieldCell}>
            <Field label={label} value={value} />
          </View>
        ))}
      </View>
    </Section>
  );
}

/** Their family one line away, each a step to walk to (the web's folded Family). */
function FamilyRows({
  family,
  person,
  onWalk,
}: {
  family: Family;
  person: FamilyPerson;
  onWalk: (id: string) => void;
}) {
  const palette = usePalette();
  const relatives = React.useMemo(() => relativesOf(family, person.id), [family, person.id]);
  const groups = (["parents", "spouses", "siblings", "children"] as const).filter(
    (g) => relatives[g].length > 0,
  );
  if (groups.length === 0) return null;
  return (
    <Section title="Family">
      {groups.map((g) => (
        <View key={g} style={styles.group}>
          <Text style={[styles.groupName, { color: palette.mutedForeground }]}>{GROUP_NAMES[g]}</Text>
          {relatives[g].map((rid) => {
            const r = family.people.get(rid);
            if (!r) return null;
            return (
              <Pressable
                key={rid}
                accessibilityRole="button"
                onPress={() => onWalk(rid)}
                style={({ pressed }) => [styles.relative, { borderColor: palette.border }, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.relativeName, { color: palette.foreground }]}>
                  {rid === family.selfId ? "You" : personDisplayName(r)}
                </Text>
                <Text style={[styles.relativeWord, { color: palette.mutedForeground }]}>
                  {relationWord(g, r.sex)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 40 },
  hero: { justifyContent: "flex-end" },
  scrim: { position: "absolute", top: 0, right: 0, bottom: 0, left: 0, backgroundColor: "rgba(0,0,0,0.35)" },
  heroText: { padding: GUTTER + 4, gap: 2 },
  onPhoto: { color: "#ffffff" },
  onPhotoMuted: { color: "rgba(255,255,255,0.85)" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: GUTTER + 4,
    paddingTop: 28,
  },
  face: {
    width: FACE,
    height: FACE,
    borderRadius: FACE / 2,
    alignItems: "center",
    justifyContent: "center",
  },
  faceText: { fontFamily: font.semibold, fontSize: 20 },
  headText: { flex: 1, minWidth: 0, gap: 2 },
  name: { fontFamily: font.semibold, fontSize: 24 },
  sub: { fontFamily: font.regular, fontSize: 15 },
  connection: { paddingHorizontal: GUTTER + 4, marginTop: 16, gap: 8 },
  relation: { fontFamily: font.medium, fontSize: 17 },
  chain: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  arrow: { fontFamily: font.regular, fontSize: 14 },
  step: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  stepText: { fontFamily: font.medium, fontSize: 13 },
  badges: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    paddingHorizontal: GUTTER + 4,
    marginTop: 12,
  },
  badge: {
    fontFamily: font.medium,
    fontSize: 12,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    overflow: "hidden",
  },
  actions: { paddingHorizontal: GUTTER + 4, marginTop: 18, gap: 10 },
  pair: { flexDirection: "row", gap: 10 },
  half: { flex: 1 },
  fields: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
  fieldCell: { width: "50%", paddingRight: 8 },
  group: { gap: 2 },
  groupName: { fontFamily: font.medium, fontSize: 13, marginTop: 4 },
  relative: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  relativeName: { fontFamily: font.medium, fontSize: 16 },
  relativeWord: { fontFamily: font.regular, fontSize: 14 },
  loading: { marginTop: 24 },
  failed: { paddingHorizontal: GUTTER + 4, marginTop: 22, gap: 10, alignItems: "flex-start" },
});
