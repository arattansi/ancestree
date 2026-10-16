import { relationOf, type ConnectionRelationship } from "@/lib/connection-path";
import { blankFields } from "@/lib/fill-blanks";
import { asDatePrecision, formatPartialDate, type DatePrecision } from "@/lib/partial-date";
import { personDisplayName, personFullName } from "@/lib/person-name";
import type {
  FactProposal,
  FactWay,
  MentionOffer,
  RelativeProposal,
  ScribeFacts,
} from "@/lib/scribe-facts";
import { suggestionRows, type SuggestionColumns } from "@/lib/suggestions";

/**
 * The scribe's fact finding, the part that needs no database (Step 148.2):
 * who Claude is told about, how they're written out for it, and how what it
 * says becomes details for the member to accept (`lib/scribe-facts.ts`).
 * `lib/scribe-facts.server.ts` reads the rows and asks Claude.
 */

/** Someone on the tree as the scribe reads them: their names and dates. */
export type RosterRow = {
  id: string;
  first_name: string | null;
  middle_name: string | null;
  preferred_name: string | null;
  maiden_name: string | null;
  last_name: string | null;
  placeholder_number: number | null;
  sex: string | null;
  date_of_birth: string | null;
  date_of_birth_precision: string | null;
  birth_month: number | null;
  birth_day: number | null;
  date_of_birth_circa: boolean | null;
  place_id_birth: number | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  is_deceased: boolean | null;
  date_of_death: string | null;
  date_of_death_precision: string | null;
  date_of_death_circa: boolean | null;
  place_id_death: number | null;
  place_of_death: string | null;
};

/** Someone Claude is told about, by the code it names them with. */
export type RosterPerson = {
  ref: string;
  row: RosterRow;
  /** What they are to the leaf ("son"), or null when nothing joins them. */
  toLeaf: string | null;
  /** What they are to the member recording it. */
  toRecorder: string | null;
};

export type Roster = {
  leaf: RosterPerson;
  recorder: RosterPerson | null;
  people: RosterPerson[];
};

/** How many people Claude is told about at most, nearest the leaf first. */
export const ROSTER_MAX = 150;

/**
 * The people a story on `leafId`'s leaf may well be about: the leaf, then
 * everyone the tree's lines reach from them, nearest first, then anyone
 * only the recorder's lines reach, up to `max`; the recorder always. A
 * placeholder child has no name to be told about.
 */
export function buildRoster(input: {
  rows: RosterRow[];
  lines: ConnectionRelationship[];
  leafId: string;
  recorderId: string | null;
  max?: number;
}): Roster | null {
  const { rows, lines, leafId, recorderId, max = ROSTER_MAX } = input;
  const byId = new Map(rows.filter((r) => r.placeholder_number == null).map((r) => [r.id, r]));
  if (!byId.has(leafId)) return null;

  const near = new Map<string, string[]>();
  const link = (a: string, b: string) => {
    if (!byId.has(a) || !byId.has(b) || a === b) return;
    near.set(a, [...(near.get(a) ?? []), b]);
  };
  for (const l of lines) {
    link(l.from_person, l.to_person);
    link(l.to_person, l.from_person);
  }
  const walk = (from: string) => {
    const order = [from];
    const seen = new Set(order);
    for (let i = 0; i < order.length; i++) {
      for (const next of near.get(order[i]) ?? []) {
        if (!seen.has(next)) {
          seen.add(next);
          order.push(next);
        }
      }
    }
    return order;
  };
  const ids = [...walk(leafId)];
  if (recorderId && byId.has(recorderId)) {
    for (const id of walk(recorderId)) if (!ids.includes(id)) ids.push(id);
  }
  const kept = ids.slice(0, max);
  if (recorderId && byId.has(recorderId) && !kept.includes(recorderId)) kept.push(recorderId);

  const sexes = new Map([...byId].map(([id, r]) => [id, { sex: r.sex }]));
  const relation = (from: string, to: string | null) => {
    if (!to) return null;
    const r = relationOf(from, to, sexes, lines);
    return r && "term" in r ? r.term.toLowerCase() : null;
  };
  const people = kept.map((id, i) => ({
    ref: `P${i + 1}`,
    row: byId.get(id)!,
    toLeaf: relation(id, leafId),
    toRecorder: recorderId && byId.has(recorderId) ? relation(id, recorderId) : null,
  }));
  return {
    leaf: people[0],
    recorder: people.find((p) => p.row.id === recorderId) ?? null,
    people,
  };
}

/** "1931 in Mombasa, Kenya", "in Mombasa", "5 March": what the tree says of a birth. */
function bornText(r: RosterRow): string {
  const when = formatPartialDate(
    r.date_of_birth,
    r.date_of_birth_precision,
    r.birth_month && r.birth_day ? { month: r.birth_month, day: r.birth_day } : null,
    r.date_of_birth_circa,
  );
  const where = [r.city_of_birth, r.country_of_birth].map((s) => s?.trim()).filter(Boolean).join(", ");
  if (!when && !where) return "born: not on the tree";
  return ["born", when, where ? `in ${where}` : null].filter(Boolean).join(" ");
}

function diedText(r: RosterRow): string {
  if (!r.is_deceased && !r.date_of_death) return "living, as far as the tree says";
  const when = formatPartialDate(r.date_of_death, r.date_of_death_precision, null, r.date_of_death_circa);
  const where = r.place_of_death?.trim();
  if (!when && !where) return "has died (no date or place on the tree)";
  return ["died", when, where ? `in ${where}` : null].filter(Boolean).join(" ");
}

/** One person as Claude reads them. */
function rosterLine(p: RosterPerson, roster: Roster): string {
  const isLeaf = p === roster.leaf;
  const isRecorder = p === roster.recorder;
  return [
    p.ref,
    personFullName(p.row),
    p.row.sex === "male" || p.row.sex === "female" ? p.row.sex : null,
    isLeaf ? "the leaf" : p.toLeaf ? `the leaf's ${p.toLeaf}` : null,
    isRecorder ? "the recorder" : p.toRecorder ? `the recorder's ${p.toRecorder}` : null,
    bornText(p.row),
    diedText(p.row),
  ]
    .filter(Boolean)
    .join(" · ");
}

const LONG_DATE = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** The words Claude is given: when, whose leaf, who's recording, the family, what was heard. */
export function factsPrompt(input: {
  roster: Roster;
  heard: string;
  locale: string | null;
  today: Date;
}): string {
  const { roster, heard, locale, today } = input;
  const leaf = roster.leaf;
  const lines = [
    `Today is ${LONG_DATE.format(today)}.`,
    `The story is told on ${leaf.ref}'s leaf: ${personDisplayName(leaf.row)}.`,
  ];
  if (roster.recorder) {
    lines.push(
      roster.recorder === leaf
        ? `${leaf.ref} recorded it themself.`
        : `${roster.recorder.ref} (${personDisplayName(roster.recorder.row)}) recorded it.`,
    );
  }
  lines.push(
    locale ? `The phone listened for ${locale}.` : "It was typed, or dictated with the phone's keyboard.",
    "",
    "<family>",
    ...roster.people.map((p) => rosterLine(p, roster)),
    "</family>",
    "",
    "<heard>",
    heard,
    "</heard>",
  );
  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// What Claude says, and what's offered for it
// ---------------------------------------------------------------------------

/** A place as the story names it. */
export type PlaceSaid = {
  town: string | null;
  region: string | null;
  country: string | null;
};

/** One thing Claude found about someone on the list. */
export type FactSaid = {
  person: string;
  event: "birth" | "death";
  year: number | null;
  month: number | null;
  day: number | null;
  circa: boolean;
  place: PlaceSaid | null;
  evidence: string;
};

/** Someone the story names who isn't on the list. */
export type RelativeSaid = {
  first_name: string | null;
  last_name: string | null;
  sex: "male" | "female" | null;
  relation: "parent" | "child" | "sibling" | "spouse";
  of: string;
  has_died: boolean;
  born_year: number | null;
  born_circa: boolean;
  born_place: PlaceSaid | null;
  died_year: number | null;
  died_circa: boolean;
  evidence: string;
};

/** Claude's answer as a whole. */
export type FactsSaid = {
  mentioned: string[];
  facts: FactSaid[];
  new_relatives: RelativeSaid[];
};

/** A place found in `places` for one the story named. */
export type FoundPlace = {
  id: number;
  /** The town, "" for a whole country (Step 79). */
  city: string;
  country: string;
  /** "Dhrol, India", or "India". */
  label: string;
};

const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

/** What the place search is asked for a place said: "Dhrol, Gujarat, India". */
export function placeQuery(place: PlaceSaid | null): string | null {
  if (!place) return null;
  const parts = [place.town, place.region, place.country].map(clean).filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

/** What the search is asked when the place itself isn't found: its country. */
export function countryQuery(place: PlaceSaid | null): string | null {
  const country = clean(place?.country);
  return country && placeQuery(place) !== country ? country : null;
}

/** What the member may do with an entry's details (`entry_rights`). */
export type EntryRights = {
  canEdit: boolean;
  canFill: boolean;
  /** A tree of theirs showing it in full, to suggest a change from. */
  suggestTree: string | null;
};

type StoryDate = {
  date: string | null;
  precision: DatePrecision;
  /** A birthday with no year (Step 63). */
  month: number | null;
  day: number | null;
  circa: boolean;
};

const pad = (n: number) => String(n).padStart(2, "0");

const daysIn = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate();

/** A date the story gives, as an entry keeps it, or null when it's no date. */
export function storyDate(
  said: Pick<FactSaid, "year" | "month" | "day" | "circa">,
  today: Date,
): StoryDate | null {
  const { year, circa } = said;
  const month = said.month != null && said.month >= 1 && said.month <= 12 ? said.month : null;
  const day =
    month != null && said.day != null && said.day >= 1 && said.day <= daysIn(year ?? 2000, month)
      ? said.day
      : null;
  if (year == null) {
    return month && day ? { date: null, precision: "day", month, day, circa: false } : null;
  }
  if (!Number.isInteger(year) || year < 1000 || year > today.getUTCFullYear()) return null;
  const precision: DatePrecision = day ? "day" : month ? "month" : "year";
  const date = `${year}-${pad(month ?? 1)}-${pad(day ?? 1)}`;
  if (date > today.toISOString().slice(0, 10)) return null;
  return { date, precision, month: null, day: null, circa: !!circa };
}

const RANK: Record<DatePrecision, number> = { day: 0, month: 1, year: 2 };

/** Whether two dates agree as far as the coarser of them is known. */
function agree(a: string, ap: DatePrecision, b: string, bp: DatePrecision): boolean {
  const upto = Math.max(RANK[ap], RANK[bp]);
  const length = upto === RANK.year ? 4 : upto === RANK.month ? 7 : 10;
  return a.slice(0, length) === b.slice(0, length);
}

const yearOf = (d: string | null | undefined) => (d ? Number(d.slice(0, 4)) : null);

/**
 * The date columns a story's date would change on an entry, or none: an
 * entry's date isn't made rougher, nor replaced by a guess ("around 1930"
 * against the tree's 1931), and a birthday it keeps without a year gains
 * the year rather than losing the day.
 */
function dateChanges(event: "birth" | "death", said: StoryDate, row: RosterRow): SuggestionColumns {
  const birth = event === "birth";
  const has = birth ? row.date_of_birth : row.date_of_death;
  const hasPrecision = asDatePrecision(birth ? row.date_of_birth_precision : row.date_of_death_precision);
  const hasCirca = !!(birth ? row.date_of_birth_circa : row.date_of_death_circa);
  let next = said;

  if (!said.date) {
    // A birthday with no year: only where the tree has no birthday at all,
    // or the year alone, which it then completes.
    if (!birth) return {};
    if (!has && row.birth_month == null) next = said;
    else if (has && hasPrecision === "year" && !hasCirca) {
      next = {
        ...said,
        date: `${has.slice(0, 4)}-${pad(said.month!)}-${pad(said.day!)}`,
        month: null,
        day: null,
      };
    } else return {};
  } else if (has) {
    if (agree(said.date, said.precision, has, hasPrecision)) {
      // The same date: offered only when the story knows it better.
      const finer = RANK[said.precision] < RANK[hasPrecision];
      if (said.circa || !(finer || hasCirca)) return {};
    } else if (said.circa && !hasCirca) {
      return {};
    }
  } else if (birth && row.birth_month != null && row.birth_day != null) {
    // A year for a birthday the tree keeps without one.
    if (said.precision === "year") {
      next = { ...said, date: `${said.date.slice(0, 4)}-${pad(row.birth_month)}-${pad(row.birth_day)}`, precision: "day" };
    } else if (said.precision === "month" && Number(said.date.slice(5, 7)) === row.birth_month) {
      next = { ...said, date: `${said.date.slice(0, 7)}-${pad(row.birth_day)}`, precision: "day" };
    }
  }

  // A birth after a death, or a death before a birth, isn't offered.
  const y = yearOf(next.date);
  if (y != null) {
    if (birth && yearOf(row.date_of_death) != null && y > yearOf(row.date_of_death)!) return {};
    if (!birth && yearOf(row.date_of_birth) != null && y < yearOf(row.date_of_birth)!) return {};
  }

  return birth
    ? {
        date_of_birth: next.date,
        date_of_birth_precision: next.precision,
        birth_month: next.month,
        birth_day: next.day,
        date_of_birth_circa: next.date ? next.circa : false,
      }
    : {
        date_of_death: next.date,
        date_of_death_precision: next.precision,
        date_of_death_circa: next.circa,
      };
}

/**
 * The place columns a place the story names would change, or none: the
 * same place, or only the country of one the tree already has, isn't news.
 */
function placeChanges(event: "birth" | "death", place: FoundPlace, row: RosterRow): SuggestionColumns {
  const birth = event === "birth";
  const hasId = birth ? row.place_id_birth : row.place_id_death;
  if (hasId === place.id) return {};
  const hasCountry = birth
    ? clean(row.country_of_birth)
    : clean(row.place_of_death).split(", ").pop() ?? "";
  const hasAny = birth
    ? hasId != null || !!clean(row.city_of_birth) || !!clean(row.country_of_birth)
    : hasId != null || !!clean(row.place_of_death);
  if (!place.city && hasAny && hasCountry.toLowerCase() === place.country.toLowerCase()) return {};
  return birth
    ? { place_id_birth: place.id, city_of_birth: place.city || null, country_of_birth: place.country }
    : { place_id_death: place.id, place_of_death: place.label };
}

/** The entry's own columns, as a suggestion holds them. */
function columnsOf(row: RosterRow): SuggestionColumns {
  return {
    date_of_birth: row.date_of_birth,
    date_of_birth_precision: row.date_of_birth_precision,
    birth_month: row.birth_month,
    birth_day: row.birth_day,
    date_of_birth_circa: !!row.date_of_birth_circa,
    place_id_birth: row.place_id_birth,
    city_of_birth: row.city_of_birth,
    country_of_birth: row.country_of_birth,
    is_deceased: !!row.is_deceased,
    date_of_death: row.date_of_death,
    date_of_death_precision: row.date_of_death_precision,
    date_of_death_circa: !!row.date_of_death_circa,
    place_id_death: row.place_id_death,
    place_of_death: row.place_of_death,
  };
}

/** Whether filling in the blanks (Step 44) makes every one of these changes. */
function fills(changes: SuggestionColumns, row: RosterRow): boolean {
  if ("is_deceased" in changes) return false;
  // Where someone lives now (Step 153) isn't among what a story fills in.
  const blank = new Set<string>(
    blankFields({
      ...row,
      is_deceased: !!row.is_deceased,
      photo_path: "kept",
      place_id_residence: null,
      place_of_residence: null,
    }),
  );
  const touches = (columns: string[]) => columns.some((c) => c in changes);
  return (
    (!touches(["date_of_birth", "birth_month"]) || blank.has("date_of_birth")) &&
    (!touches(["place_id_birth"]) || blank.has("place_of_birth")) &&
    (!touches(["date_of_death"]) || blank.has("date_of_death")) &&
    (!touches(["place_id_death"]) || blank.has("place_of_death"))
  );
}

/** "c. 1905, Dhrol, India": a relative's birth or death as the story gives it. */
function lifeText(year: number | null, circa: boolean, place: FoundPlace | null): string | null {
  const when = year != null ? `${circa ? "c. " : ""}${year}` : null;
  return [when, place?.label].filter(Boolean).join(", ") || null;
}

const nameKey = (s: string | null | undefined) => clean(s).toLowerCase();

/**
 * What the member is offered for Claude's answer: each detail about someone
 * on the list that the tree doesn't already say, made the way the member
 * may make it (`rights`), or left out when they may not; the people it
 * mentions; and the relatives it names who aren't on the tree.
 */
export function proposeFacts(input: {
  said: FactsSaid;
  roster: Roster;
  rights: Map<string, EntryRights>;
  /** What each `placeQuery` (or, failing it, `countryQuery`) found. */
  places: Map<string, FoundPlace | null>;
  today: Date;
}): ScribeFacts {
  const { said, roster, rights, places, today } = input;
  const byRef = new Map(roster.people.map((p) => [p.ref, p]));
  const found = (place: PlaceSaid | null): FoundPlace | null => {
    const q = placeQuery(place);
    const c = countryQuery(place);
    return (q ? places.get(q) : null) ?? (c ? places.get(c) : null) ?? null;
  };

  // A person's birth and death are each offered once, whatever Claude
  // repeated: the first it said.
  const facts: FactProposal[] = [];
  const offered = new Set<string>();
  for (const fact of said.facts) {
    const person = byRef.get(fact.person.trim());
    if (!person || (fact.event !== "birth" && fact.event !== "death")) continue;
    const at = `${person.row.id}:${fact.event}`;
    if (offered.has(at)) continue;
    // Whoever holds the phone is alive to hold it.
    if (fact.event === "death" && person === roster.recorder) continue;

    const row = person.row;
    const date = storyDate(fact, today);
    const place = found(fact.place);
    const changes: SuggestionColumns = {
      ...(date ? dateChanges(fact.event, date, row) : {}),
      ...(place ? placeChanges(fact.event, place, row) : {}),
    };
    if (fact.event === "death" && !row.is_deceased) changes.is_deceased = true;
    const rows = suggestionRows(changes, columnsOf(row));
    if (!rows.length) continue;

    const may = rights.get(row.id);
    const way: FactWay | null = !may
      ? null
      : may.canEdit
        ? "edit"
        : may.canFill && fills(changes, row)
          ? "fill"
          : may.suggestTree
            ? "suggest"
            : null;
    if (!way) continue;

    offered.add(at);
    facts.push({
      key: `f${facts.length + 1}`,
      personId: row.id,
      name: personDisplayName(row),
      event: fact.event,
      changes,
      rows,
      evidence: clean(fact.evidence),
      way,
      treeId: way === "suggest" ? may!.suggestTree : null,
    });
  }

  const mentions: MentionOffer[] = [];
  for (const ref of said.mentioned) {
    const person = byRef.get(ref.trim());
    if (!person || person === roster.leaf) continue;
    if (mentions.some((m) => m.personId === person.row.id)) continue;
    mentions.push({ personId: person.row.id, name: personDisplayName(person.row) });
  }

  const relatives: RelativeProposal[] = [];
  for (const r of said.new_relatives) {
    const of = byRef.get(r.of.trim());
    const first = clean(r.first_name) || null;
    const last = clean(r.last_name) || null;
    if (!of || !first || !["parent", "child", "sibling", "spouse"].includes(r.relation)) continue;
    // Someone already on the list isn't new.
    const known = roster.people.some(
      (p) =>
        [p.row.first_name, p.row.preferred_name].some((n) => nameKey(n) === nameKey(first)) &&
        (!last || [p.row.last_name, p.row.maiden_name].some((n) => nameKey(n) === nameKey(last))),
    );
    if (known) continue;
    const year = (y: number | null) =>
      y != null && Number.isInteger(y) && y >= 1000 && y <= today.getUTCFullYear() ? y : null;
    const bornYear = year(r.born_year);
    // A death before the birth isn't kept.
    const diedYear = bornYear != null && (year(r.died_year) ?? bornYear) < bornYear ? null : year(r.died_year);
    const bornPlace = found(r.born_place);
    relatives.push({
      key: `r${relatives.length + 1}`,
      firstName: first,
      lastName: last,
      sex: r.sex === "male" || r.sex === "female" ? r.sex : null,
      relation: r.relation,
      ofId: of.row.id,
      ofName: personDisplayName(of.row),
      born: lifeText(bornYear, r.born_circa, bornPlace),
      died: r.has_died || diedYear != null,
      diedWhen: lifeText(diedYear, r.died_circa, null),
      evidence: clean(r.evidence),
      bornYear: bornYear != null ? { year: bornYear, circa: !!r.born_circa } : null,
      bornPlace: bornPlace ? { id: bornPlace.id, city: bornPlace.city, country: bornPlace.country } : null,
      diedYear: diedYear != null ? { year: diedYear, circa: !!r.died_circa } : null,
    });
  }

  return { facts, mentions, relatives };
}
