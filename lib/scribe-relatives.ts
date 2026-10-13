import { OWN_LINE_REFUSAL, isOwnLineRefusal } from "@/lib/account-types";
import { readBloodTieRefusal } from "@/lib/bloodline";
import { isEmailAddress } from "@/lib/email-address";
import {
  computeImpliedConnections,
  type DetectionTree,
  type ImpliedConnection,
  type PendingEdge,
} from "@/lib/connection-suggestions";
import {
  buildChainEdges,
  refToString,
  type ConnectionEdge,
  type PersonRef,
} from "@/lib/connections";
import {
  minorRefusal,
  newPeopleToAsk,
  readAskAdult,
  readMinorRefusal,
  underAgeMessage,
  type AskAdult,
} from "@/lib/minors";
import type { RelativeProposal } from "@/lib/scribe-facts";

/**
 * Adding the relatives the scribe finds (Step 148.3): someone a story names
 * who isn't on the tree yet, ticked by the member, is added with one line to
 * the person it named, through `add_people_with_connections`, as the web's
 * "Add a relative" adds them (`app/actions/connections.ts#addRelative`). The
 * same questions come first: "Is {name} 18 or older?" of someone who'd be a
 * child or sibling (Step 98), the connections the tree then implies
 * (`computeImpliedConnections`), and "is X 18 or older?" of someone on the
 * tree a line would make a child or sibling for the first time, which only
 * the database knows to ask (`check_add_people_with_connections`). The
 * database decides again as each is added.
 *
 * Plain TypeScript: the phone imports it.
 */

/** An answer to a connection the tree implies, as the web's dialog takes it. */
export type Resolution = "accepted" | "dismissed" | "pending";

/** What the member has made of one relative: the names as typed, the answers given. */
export type RelativeDraft = {
  firstName: string;
  lastName: string;
  /** "Is {name} 18 or older?", where it's asked of them; null till answered. */
  adult: boolean | null;
  /** Each connection the tree implies, answered, by `questionKey`. */
  answers: Record<string, Resolution>;
  /** Someone on the tree a line asks about ("is X 18 or older?"), answered, by id. */
  existing: Record<string, boolean>;
  /** Where to invite them to claim their entry once added (148.4); "" for nowhere. */
  email: string;
  /** Tag them in the story once they're added (148.5, a Root's to offer). */
  tag: boolean;
};

export function relativeDraft(r: RelativeProposal): RelativeDraft {
  return {
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    adult: null,
    answers: {},
    existing: {},
    email: "",
    tag: false,
  };
}

/**
 * Where their invite to claim the entry goes once they're added, or "" for
 * none, as the web's add form has it (`inviteAddress`): nobody is invited
 * to claim the entry of someone who has died.
 */
export function relativeInviteAddress(r: RelativeProposal, draft: RelativeDraft): string {
  return r.died ? "" : draft.email.trim().toLowerCase();
}

const NEW: PersonRef = { kind: "new", index: 0 };

/** Their one line: to the person the story named, as it named it. */
export function relativeEdges(r: RelativeProposal): ConnectionEdge[] {
  return buildChainEdges(r.ofId, [NEW], [r.relation]);
}

/** Their name as typed: "Rahim Jaffer". */
export function relativeName(draft: RelativeDraft): string {
  return (
    [draft.firstName, draft.lastName]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(" ") || "This person"
  );
}

/** Their date of birth as the add form holds it ("1938"), if the story gave one. */
const birthField = (r: RelativeProposal) =>
  r.bornYear ? String(r.bornYear.year) : null;

/**
 * Whether "Is {name} 18 or older?" is asked of them, as the web's form asks
 * it: a living child or sibling, unless the member is their parent or their
 * year of birth says so already.
 */
export function asksAdult(
  r: RelativeProposal,
  selfId: string | null,
  today?: Date,
): boolean {
  return newPeopleToAsk({
    people: [{ is_deceased: r.died, date_of_birth: birthField(r) }],
    edges: relativeEdges(r),
    self: selfId ? { kind: "existing", id: selfId } : null,
    today,
  }).includes(0);
}

/**
 * The connections the tree implies once they're on it ("Is Amina also
 * Rahim's parent?"), to answer before they're added, as the web's add form
 * asks them. `tree` is the tree they're added to (`detectionTree`).
 *
 * A yes draws its line, and what the tree implies with it is asked too:
 * a new brother whose parents are said yes to may be a brother the tree
 * has already ("the same person?"). The web's form draws those parents
 * before it asks (a sibling's "also link to their parents", a child's
 * other parent); the phone asks for them first.
 */
export function relativeQuestions(
  r: RelativeProposal,
  draft: RelativeDraft,
  tree: DetectionTree,
): ImpliedConnection[] {
  const ask = (pendingEdges: PendingEdge[]) =>
    computeImpliedConnections({
      newPeople: [
        {
          familyName: draft.lastName.trim(),
          dateOfBirth: birthField(r),
          givenName: draft.firstName.trim() || null,
          label: relativeName(draft),
        },
      ],
      pendingEdges,
      existingPeople: tree.people,
      existingEdges: tree.edges,
      resolvedKeys: tree.resolvedKeys,
      nicknameGroups: tree.nicknameGroups,
    });
  const first = ask(relativeEdges(r));
  const drawn: PendingEdge[] = first.flatMap((q) =>
    draft.answers[questionKey(q)] === "accepted" &&
    (q.suggestedType === "parent" || q.suggestedType === "spouse")
      ? [{ type: q.suggestedType, a: q.subject, b: q.related }]
      : [],
  );
  if (!drawn.length) return first;
  const asked = new Set(first.map(questionKey));
  return [
    ...first,
    ...ask([...relativeEdges(r), ...drawn]).filter((q) => !asked.has(questionKey(q))),
  ];
}

/** A question's key: steady while the names are typed. */
export function questionKey(q: ImpliedConnection): string {
  return `${q.suggestedType}|${refToString(q.subject)}|${refToString(q.related)}`;
}

/** What a question's yes says, as the web's add form says it. */
export function yesWords(q: ImpliedConnection): string {
  return q.suggestedType === "spouse"
    ? "yes, they’re partners"
    : q.suggestedType === "parent"
      ? "yes, add the parent"
      : q.suggestedType === "duplicate_check"
        ? "yes, same person"
        : "yes";
}

/**
 * Who on the tree the member said they are ("yes, same person"): then
 * they're there already and aren't added. Null otherwise.
 */
export function sameAs(
  questions: ImpliedConnection[],
  draft: RelativeDraft,
  tree: DetectionTree,
): string | null {
  for (const q of questions) {
    if (q.suggestedType !== "duplicate_check") continue;
    if (draft.answers[questionKey(q)] !== "accepted") continue;
    const other = [q.subject, q.related].find((ref) => ref.kind === "existing");
    if (other?.kind === "existing") return tree.labelById.get(other.id) ?? "someone";
  }
  return null;
}

/**
 * The answered questions as the add takes them: each rule behind one, so
 * none of them asks again (as the web records them).
 */
export function relativeSuggestions(
  questions: ImpliedConnection[],
  answers: Record<string, Resolution>,
) {
  return questions.flatMap((q) => {
    const resolution = answers[questionKey(q)];
    if (!resolution) return [];
    return [q.source, ...q.alsoFrom].map((source) => ({
      subject: refToString(q.subject),
      related: refToString(q.related),
      suggested_type: q.suggestedType,
      source,
      resolution,
    }));
  });
}

/**
 * The new entry as `add_people_with_connections` takes it: the names typed,
 * a year of birth and death as the story gave them, the place it was found
 * as. `adult` is the answer to "18 or older?" where it's asked.
 */
export function relativeRow(
  r: RelativeProposal,
  draft: RelativeDraft,
  adult: boolean | null,
) {
  const born = r.bornYear ?? null;
  const died = r.died ? (r.diedYear ?? null) : null;
  return {
    first_name: draft.firstName.trim(),
    middle_name: "",
    preferred_name: "",
    maiden_name: "",
    last_name: draft.lastName.trim(),
    country_of_birth: r.bornPlace?.country ?? "",
    city_of_birth: r.bornPlace?.city ?? "",
    date_of_birth: born ? `${born.year}-01-01` : "",
    date_of_birth_precision: born ? "year" : "day",
    birth_month: null,
    birth_day: null,
    is_deceased: r.died,
    date_of_death: died ? `${died.year}-01-01` : "",
    date_of_death_precision: died ? "year" : "day",
    place_of_death: "",
    adult,
  };
}

/**
 * What's set on the new entry once it exists, as the web sets it after the
 * same call (which takes none of it): the place of birth it was found as,
 * their sex, and "c." on a rough year. Null when there's nothing.
 */
export function relativeAfter(r: RelativeProposal) {
  const update = {
    ...(r.bornPlace ? { place_id_birth: r.bornPlace.id } : {}),
    ...(r.sex ? { sex: r.sex } : {}),
    ...(r.bornYear?.circa ? { date_of_birth_circa: true } : {}),
    ...(r.died && r.diedYear?.circa ? { date_of_death_circa: true } : {}),
  };
  return Object.keys(update).length ? update : null;
}

/** An error as PostgREST gives it, or as `check_add_people_with_connections` returns it. */
export type DbSaid = { message?: string | null; details?: string | null };

/** The rule a blood-tie refusal states (`lib/bloodline.ts#bloodTieWarning`). */
export const BLOOD_TIE_RULE = "Only blood relatives and their partners can be added.";

/**
 * What the database said instead of adding them: a question about someone
 * already on the tree, or why they can't be added. `name` is theirs as typed.
 */
export function readRelativeRefusal(
  said: DbSaid | null | undefined,
  name: string,
): { ask: AskAdult } | { error: string } {
  const ask = readAskAdult(said);
  if (ask) return { ask };
  const minor = readMinorRefusal(said);
  if (minor) {
    return { error: underAgeMessage(said?.details === "new:0" ? name : minor.name) };
  }
  if (readBloodTieRefusal(said)) return { error: BLOOD_TIE_RULE };
  const message = said?.message ?? "";
  if (isOwnLineRefusal(message)) return { error: OWN_LINE_REFUSAL };
  if (message.includes("people_required_identity")) {
    return { error: "Add their first and last name." };
  }
  if (message.includes("parent/child loop")) {
    return { error: "That would make a parent/child loop." };
  }
  if (message.includes("partners and parent and child")) {
    return { error: "Two people can't be both partners and parent and child." };
  }
  if (message.includes("not a member of this tree") || message.includes("not in this tree")) {
    return { error: "They can only be added on your own tree." };
  }
  return { error: "Couldn’t add them." };
}

/** What `check_add_people_with_connections` answers. */
export type CheckSaid = { ok: true } | ({ ok: false } & DbSaid);

export function isCheckSaid(value: unknown): value is CheckSaid {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { ok?: unknown }).ok === "boolean"
  );
}

/** What the database says to adding someone, once each person a line asks about says yes. */
export type Judged = { asks: AskAdult[]; error: string | null };

/**
 * What the database says to adding them. Each time a line asks about
 * someone on the tree, it's asked again as if they'd said yes, so a
 * question is only put when a yes would let them in, and a refusal waiting
 * behind it is said at once. `asked` are those asked about already.
 */
export async function judgeRelative(
  check: (adultIds: string[]) => Promise<CheckSaid>,
  asked: readonly string[],
  name: string,
): Promise<Judged> {
  const asks: AskAdult[] = [];
  const ids = [...asked];
  // One line asks about one person at most; a few rounds are plenty.
  for (let round = 0; round < 4; round++) {
    const said = await check([...ids]);
    if (said.ok) return { asks, error: null };
    const read = readRelativeRefusal(said, name);
    if ("error" in read) return { asks, error: read.error };
    if (ids.includes(read.ask.id)) break;
    asks.push(read.ask);
    ids.push(read.ask.id);
  }
  return { asks, error: "Couldn’t add them." };
}

/** Where a ticked relative stands before the story's saved. */
export type RelativeStatus =
  | { at: "ready" }
  /** "yes, same person": already on the tree, so not added. */
  | { at: "same"; as: string }
  /** Not yet: a name to type, a question to answer, a check to finish. */
  | { at: "waiting"; why: string }
  | { at: "refused"; why: string };

/**
 * Where a ticked relative stands: ready to add once the story's saved, on
 * the tree already, waiting on the member, or refused. `asks` are those on
 * the tree the database asks about; `judged` is null while it's still
 * being asked.
 */
export function relativeStatus(input: {
  r: RelativeProposal;
  draft: RelativeDraft;
  selfId: string | null;
  questions: ImpliedConnection[] | null;
  tree: DetectionTree | null;
  asks: AskAdult[];
  judged: { error: string | null } | null;
  today?: Date;
}): RelativeStatus {
  const { r, draft, selfId, questions, tree, asks, judged, today } = input;
  const name = relativeName(draft);
  if (!draft.firstName.trim()) return { at: "waiting", why: "Add their first name." };
  if (!draft.lastName.trim()) {
    return { at: "waiting", why: `Add ${draft.firstName.trim()}’s last name.` };
  }
  const same = questions && tree ? sameAs(questions, draft, tree) : null;
  if (same) return { at: "same", as: same };
  const address = relativeInviteAddress(r, draft);
  if (address && !isEmailAddress(address)) {
    return { at: "waiting", why: `Check ${draft.firstName.trim()}’s email address.` };
  }

  const asked = asksAdult(r, selfId, today);
  if (asked) {
    const underAge = minorRefusal({
      asked: [0],
      people: [{ date_of_birth: birthField(r) }],
      answers: new Map(draft.adult === null ? [] : [[0, draft.adult]]),
      nameOf: () => name,
      today,
    });
    if (underAge) return { at: "refused", why: underAge };
  }
  const saidNo = asks.find((a) => draft.existing[a.id] === false);
  if (saidNo) return { at: "refused", why: underAgeMessage(saidNo.name) };
  if (judged?.error) return { at: "refused", why: judged.error };

  const unanswered =
    (asked && draft.adult === null) ||
    (questions ?? []).some((q) => !draft.answers[questionKey(q)]) ||
    asks.some((a) => draft.existing[a.id] === undefined);
  if (unanswered) return { at: "waiting", why: `Answer the questions about ${name}.` };
  if (!questions || !judged) return { at: "waiting", why: `Still checking ${name}.` };
  return { at: "ready" };
}

/** How adding one relative went, and their invite and tag if asked for. */
export type RelativeMade = {
  name: string;
  /** Why they weren't added; null when they were. */
  error: string | null;
  /** Their new entry, once added. */
  id?: string;
  /** To be tagged in the story once added (148.5). */
  tag?: boolean;
  /** Tagged in the story. */
  tagged?: boolean;
  /** Added, but not tagged: why. */
  tagError?: string;
  /** The address their invite to claim went to (148.4). */
  invited?: string;
  /** Added, but the invite didn't go: why. */
  inviteError?: string;
};

/**
 * How adding the relatives went: "Rahim Jaffer added. Invite sent to
 * rahim@example.com. Rahim Jaffer tagged in the story."
 */
export function relativesDone(made: RelativeMade[]): string | null {
  const added = made.filter((m) => !m.error);
  const failed = made.filter((m) => m.error);
  const invited = added.filter((m) => m.invited);
  const unsent = added.filter((m) => m.inviteError);
  const tagged = added.filter((m) => m.tagged);
  const untagged = added.filter((m) => m.tagError);
  const said =
    added.length === 1
      ? `${added[0].name} added.`
      : added.length > 1
        ? `${added.length} relatives added.`
        : "";
  const sent =
    invited.length === 1
      ? `Invite sent to ${invited[0].invited}.`
      : invited.length > 1
        ? `${invited.length} invites sent.`
        : "";
  const notSent = unsent.length
    ? `${unsent[0].name}’s invite didn’t send: ${unsent[0].inviteError}`
    : "";
  const tags =
    tagged.length === 1
      ? `${tagged[0].name} tagged in the story.`
      : tagged.length > 1
        ? `${tagged.length} tagged in the story.`
        : "";
  const notTagged = untagged.length
    ? `${untagged.length === 1 ? untagged[0].name : `${untagged.length} relatives`} couldn’t be tagged in the story: ${untagged[0].tagError}`
    : "";
  const missed =
    failed.length === 1
      ? `${failed[0].name} couldn’t be added: ${failed[0].error}`
      : failed.length > 1
        ? `${failed.length} couldn’t be added: ${failed[0].error}`
        : "";
  return [said, sent, notSent, tags, notTagged, missed].filter(Boolean).join(" ") || null;
}
