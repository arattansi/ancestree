import type { SuggestionColumns, SuggestionRow } from "@/lib/suggestions";

/**
 * What the scribe finds in a story for the tree (Step 148.2): details about
 * people already on it (when and where someone was born or died), the
 * people it mentions, and relatives it names who aren't on it yet. Claude
 * proposes them on the server (`/api/mobile/scribe/facts`); the member
 * reads each one on the phone and nothing is written until they accept it.
 *
 * A detail is offered the way the member could make it on the web: as an
 * edit where they may edit the entry, filled in where they may only fill in
 * its blanks (Step 44), else as a suggestion to whoever can (Step 67). The
 * database decides again on every write.
 *
 * Shared by the server, which proposes, and the phone, which shows and
 * makes them. Plain TypeScript: the phone imports it too.
 */

/** How accepting a detail reaches the entry. */
export type FactWay = "edit" | "fill" | "suggest";

/** One thing the story says about someone on the tree. */
export type FactProposal = {
  /** Steady within one answer, for the phone to keep track of. */
  key: string;
  personId: string;
  /** Their name as the tree shows it. */
  name: string;
  event: "birth" | "death";
  /** The entry's columns as accepting it would leave them, only those that change. */
  changes: SuggestionColumns;
  /** What it would change, a detail at a time, from what the entry says now. */
  rows: SuggestionRow[];
  /** The words in the story it rests on, in English. */
  evidence: string;
  way: FactWay;
  /** The tree a suggestion is made from (`suggest_entry_change`); null otherwise. */
  treeId: string | null;
};

/** Someone on the tree the story mentions, to offer as a tag (Step 116). */
export type MentionOffer = { personId: string; name: string };

/** Someone the story names who isn't on the tree yet. */
export type RelativeProposal = {
  key: string;
  firstName: string | null;
  lastName: string | null;
  sex: "male" | "female" | null;
  /** What they are to `ofId`. */
  relation: "parent" | "child" | "sibling" | "spouse";
  ofId: string;
  ofName: string;
  /** "c. 1905, Dhrol, India": what the story says of their birth, if anything. */
  born: string | null;
  /** True when the story says they've died; their death as `born`, if said. */
  died: boolean;
  diedWhen: string | null;
  evidence: string;
};

/** What `/api/mobile/scribe/facts` answers with. */
export type ScribeFacts = {
  facts: FactProposal[];
  mentions: MentionOffer[];
  relatives: RelativeProposal[];
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const isText = (v: unknown): v is string => typeof v === "string";
const isTextOrNull = (v: unknown) => v === null || typeof v === "string";

function isProposal(v: unknown): v is FactProposal {
  return (
    isObject(v) &&
    isText(v.key) &&
    isText(v.personId) &&
    isText(v.name) &&
    (v.event === "birth" || v.event === "death") &&
    isObject(v.changes) &&
    Array.isArray(v.rows) &&
    isText(v.evidence) &&
    (v.way === "edit" || v.way === "fill" || v.way === "suggest") &&
    isTextOrNull(v.treeId) &&
    (v.way !== "suggest" || isText(v.treeId))
  );
}

function isRelative(v: unknown): v is RelativeProposal {
  return (
    isObject(v) &&
    isText(v.key) &&
    isTextOrNull(v.firstName) &&
    isTextOrNull(v.lastName) &&
    ["parent", "child", "sibling", "spouse"].includes(v.relation as string) &&
    isText(v.ofId) &&
    isText(v.ofName) &&
    isText(v.evidence)
  );
}

/** Whether an answer came back whole. */
export function isScribeFacts(value: unknown): value is ScribeFacts {
  return (
    isObject(value) &&
    Array.isArray(value.facts) &&
    value.facts.every(isProposal) &&
    Array.isArray(value.mentions) &&
    value.mentions.every(
      (m) => isObject(m) && isText(m.personId) && isText(m.name),
    ) &&
    Array.isArray(value.relatives) &&
    value.relatives.every(isRelative)
  );
}

/** The longest note a suggestion takes (`suggest_entry_change`). */
const NOTE_MAX = 500;

/**
 * What a suggestion says it came from, for whoever answers it: the story's
 * title, and the words each detail rests on.
 */
export function factNote(title: string, evidence: string[]): string {
  const said = [...new Set(evidence.map((e) => e.trim()).filter(Boolean))]
    .map((e) => `“${e}”`)
    .join(" ");
  const from = `From the story “${title.trim() || "Untitled"}”`;
  const note = said ? `${from}: ${said}` : `${from}.`;
  return note.length <= NOTE_MAX ? note : `${note.slice(0, NOTE_MAX - 1).trimEnd()}…`;
}

/** One write accepting some details makes: an edit, a fill or a suggestion. */
export type FactWrite = {
  personId: string;
  name: string;
  way: FactWay;
  treeId: string | null;
  changes: SuggestionColumns;
  evidence: string[];
};

/**
 * The writes accepting `facts` takes: one per person and way, so a person's
 * birth and death go as one edit (one notice, one undo) or one suggestion
 * (a newer one replaces a member's last, Step 67).
 */
export function factWrites(facts: FactProposal[]): FactWrite[] {
  const writes = new Map<string, FactWrite>();
  for (const f of facts) {
    const at = `${f.personId}:${f.way}`;
    const seen = writes.get(at);
    if (seen) {
      Object.assign(seen.changes, f.changes);
      seen.evidence.push(f.evidence);
    } else {
      writes.set(at, {
        personId: f.personId,
        name: f.name,
        way: f.way,
        treeId: f.treeId,
        changes: { ...f.changes },
        evidence: [f.evidence],
      });
    }
  }
  return [...writes.values()];
}

/**
 * What `fill_person_blanks` takes for some changes, as the web's form sends
 * it (`lib/fill-blanks.ts#fillFields`): a date with its precision, circa only
 * when it's so, a place with the labels it was picked with, nothing empty.
 */
export function fillFieldsFor(changes: SuggestionColumns): Record<string, string | number> {
  const c = changes as Record<string, unknown>;
  const fields: Record<string, unknown> = {
    date_of_birth: c.date_of_birth,
    date_of_birth_precision: c.date_of_birth ? c.date_of_birth_precision : null,
    date_of_birth_circa: c.date_of_birth_circa === true ? "true" : null,
    birth_month: c.birth_month,
    birth_day: c.birth_day,
    place_id_birth: c.place_id_birth,
    city_of_birth: c.place_id_birth != null ? c.city_of_birth : null,
    country_of_birth: c.place_id_birth != null ? c.country_of_birth : null,
    date_of_death: c.date_of_death,
    date_of_death_precision: c.date_of_death ? c.date_of_death_precision : null,
    date_of_death_circa: c.date_of_death_circa === true ? "true" : null,
    place_id_death: c.place_id_death,
    place_of_death: c.place_id_death != null ? c.place_of_death : null,
  };
  return Object.fromEntries(
    Object.entries(fields).filter(
      (entry): entry is [string, string | number] =>
        (typeof entry[1] === "string" && entry[1] !== "") || typeof entry[1] === "number",
    ),
  );
}

const KIN: Record<RelativeProposal["relation"], [string, string, string]> = {
  parent: ["parent", "father", "mother"],
  child: ["child", "son", "daughter"],
  sibling: ["sibling", "brother", "sister"],
  spouse: ["spouse", "husband", "wife"],
};

/** "Rahim, Rehmat Jaffer's brother": a relative not on the tree, as listed. */
export function relativeLine(r: RelativeProposal): string {
  const [any, male, female] = KIN[r.relation];
  const word = r.sex === "male" ? male : r.sex === "female" ? female : any;
  const name = [r.firstName, r.lastName].filter(Boolean).join(" ");
  return `${name}, ${r.ofName}’s ${word}`;
}

/** What accepting a detail does, in the words its card says it. */
export const FACT_WAY_WORDS: Record<FactWay, string> = {
  edit: "Changes their entry",
  fill: "Fills in a blank",
  suggest: "Sends a suggestion",
};

/** How making some details went: "2 changes made, 1 suggestion sent." */
export function factsDone(made: { way: FactWay; error: string | null }[]): string | null {
  const ok = made.filter((m) => !m.error);
  const changed = ok.filter((m) => m.way !== "suggest").length;
  const suggested = ok.length - changed;
  const failed = made.filter((m) => m.error);
  const parts = [
    changed ? `${changed} ${changed === 1 ? "change" : "changes"} made` : null,
    suggested ? `${suggested} ${suggested === 1 ? "suggestion" : "suggestions"} sent` : null,
  ].filter(Boolean);
  const said = parts.length ? `${parts.join(", ")}.` : "";
  const missed = failed.length
    ? `${failed.length} couldn’t be made: ${failed[0].error}`
    : "";
  return [said, missed].filter(Boolean).join(" ") || null;
}
