import { router, useFocusEffect } from "expo-router";
import * as React from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { shortWhen } from "@/lib/messenger";
import {
  groupOccasions,
  localDay,
  occasionDay,
  occasionTitle,
  upcomingOccasions,
  type Occasion,
} from "@/lib/occasions";
import { personDisplayName } from "@/lib/person-name";
import { useFamily } from "@/family/family";
import type { Family } from "@/family/load";
import { markNoticesRead, readNotices, useNotices, type Notice } from "@/feed/notices";
import { font, GUTTER, usePalette } from "@/theme";
import { AppHeader, ScreenTitle } from "@/ui/app-header";
import { Button } from "@/ui/button";

/** How far ahead Upcoming looks on the phone: the next two months. */
const AHEAD_DAYS = 62;

/**
 * The feed (Step 179.4): what's coming up in the family, and the member's
 * notices, under the calendar in the menu bar (Aalim: "consolidate feed with
 * notifications"). Status updates join it once they're scoped. Opening it
 * marks the notices read, as opening the web's bell does; the ones that
 * were new stay marked until the next visit.
 */
export default function Feed() {
  const palette = usePalette();
  const { state } = useFamily();
  const family = state.status === "ready" ? state.family : null;
  const items = useNotices((s) => s.items);
  const failed = useNotices((s) => s.failed);

  useFocusEffect(
    React.useCallback(() => {
      void readNotices().then(() => markNoticesRead());
    }, []),
  );

  const today = localDay();
  const upcoming = React.useMemo(
    () => (family ? occasionsOf(family, today) : []),
    [family, today],
  );

  return (
    <SafeAreaView edges={["top"]} style={[styles.safe, { backgroundColor: palette.background }]}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.body}>
        <ScreenTitle>Feed</ScreenTitle>

        <Section title="Upcoming">
          {upcoming.length === 0 ? (
            <Text style={[styles.empty, { color: palette.mutedForeground }]}>
              No birthdays or anniversaries in the next two months.
            </Text>
          ) : (
            groupOccasions(upcoming, today).map((group) => (
              <View key={group.key} style={styles.group}>
                <Text style={[styles.groupLabel, { color: palette.mutedForeground }]}>
                  {group.label}
                </Text>
                {group.items.map((o) => (
                  <OccasionRow key={`${o.kind}:${o.people.join(",")}`} occasion={o} family={family!} />
                ))}
              </View>
            ))
          )}
        </Section>

        <Section title="Notifications">
          {items === null ? (
            failed ? (
              <View style={styles.retry}>
                <Text style={[styles.empty, { color: palette.mutedForeground }]}>
                  Couldn&rsquo;t load your notifications.
                </Text>
                <Button variant="outline" label="try again" onPress={() => void readNotices()} />
              </View>
            ) : (
              <ActivityIndicator color={palette.green} style={styles.loading} />
            )
          ) : items.length === 0 ? (
            <Text style={[styles.empty, { color: palette.mutedForeground }]}>Nothing new.</Text>
          ) : (
            items.map((n) => <NoticeRow key={n.id} notice={n} family={family} />)
          )}
        </Section>
      </ScrollView>
    </SafeAreaView>
  );
}

/** Birthdays and anniversaries among everyone the member's trees show. */
function occasionsOf(family: Family, today: string): Occasion[] {
  const people = [...family.people.values()].map((p) => ({
    id: p.id,
    date_of_birth: p.date_of_birth,
    date_of_birth_precision: p.date_of_birth_precision ?? "day",
    birth_month: p.birth_month,
    birth_day: p.birth_day,
    date_of_birth_circa: p.date_of_birth_circa,
    date_of_death: p.date_of_death,
    is_deceased: !!p.is_deceased,
  }));
  const nameOf = (id: string) => {
    const p = family.people.get(id);
    return p ? personDisplayName(p) : "";
  };
  return upcomingOccasions(people, family.lines, today, { within: AHEAD_DAYS, nameOf });
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const palette = usePalette();
  return (
    <View style={styles.section}>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: palette.foreground }]}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function OccasionRow({ occasion, family }: { occasion: Occasion; family: Family }) {
  const palette = usePalette();
  const names = occasion.people
    .map((id) => family.people.get(id))
    .filter((p) => !!p)
    .map((p) => personDisplayName(p!));
  const first = occasion.people[0];
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/person/[id]", params: { id: first } })}
      style={({ pressed }) => [styles.row, { borderColor: palette.border }, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.rowText}>
        <Text numberOfLines={1} style={[styles.rowTitle, { color: palette.foreground }]}>
          {names.join(" & ")}
        </Text>
        <Text numberOfLines={1} style={[styles.rowMeta, { color: palette.mutedForeground }]}>
          {occasionTitle(occasion)}
        </Text>
      </View>
      <Text style={[styles.rowWhen, { color: palette.mutedForeground }]}>
        {occasion.daysAway === 0 ? "Today" : occasionDay(occasion.date)}
      </Text>
    </Pressable>
  );
}

function NoticeRow({ notice, family }: { notice: Notice; family: Family | null }) {
  const palette = usePalette();
  const person = notice.personId ? family?.people.get(notice.personId) : null;
  const unread = !notice.readAt;
  const body = (
    <>
      {unread ? <View style={[styles.dot, { backgroundColor: palette.foreground }]} /> : null}
      <View style={styles.rowText}>
        <Text style={[unread ? styles.noticeNew : styles.notice, { color: palette.foreground }]}>
          {notice.body}
        </Text>
        <Text numberOfLines={1} style={[styles.rowMeta, { color: palette.mutedForeground }]}>
          {[notice.treeName, shortWhen(notice.createdAt)].filter(Boolean).join(" · ")}
        </Text>
      </View>
    </>
  );
  return person ? (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: "/person/[id]", params: { id: person.id } })}
      style={({ pressed }) => [styles.row, { borderColor: palette.border }, pressed && { opacity: 0.6 }]}
    >
      {body}
    </Pressable>
  ) : (
    <View style={[styles.row, { borderColor: palette.border }]}>{body}</View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  body: { paddingBottom: 32 },
  section: { marginTop: 8, paddingHorizontal: GUTTER },
  sectionTitle: { fontFamily: font.semibold, fontSize: 17, marginBottom: 6 },
  group: { marginBottom: 6 },
  groupLabel: { fontFamily: font.medium, fontSize: 13, marginTop: 8, marginBottom: 2 },
  empty: { fontFamily: font.regular, fontSize: 15, paddingVertical: 8 },
  retry: { gap: 10, alignItems: "flex-start" },
  loading: { alignSelf: "flex-start", marginVertical: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: font.medium, fontSize: 16 },
  rowMeta: { fontFamily: font.regular, fontSize: 13 },
  rowWhen: { fontFamily: font.regular, fontSize: 14 },
  notice: { fontFamily: font.regular, fontSize: 15, lineHeight: 20 },
  noticeNew: { fontFamily: font.medium, fontSize: 15, lineHeight: 20 },
  dot: { width: 7, height: 7, borderRadius: 4, alignSelf: "flex-start", marginTop: 7 },
});
