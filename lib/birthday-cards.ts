import { asCardRelation, type CardRelation } from "@/lib/card-relations";
import { MONTH_NAMES } from "@/lib/partial-date";

/**
 * Birthday cards (Step 217): a card the family sign for someone's birthday,
 * kept on their node, sealed until midnight on the day where they live. The
 * database decides everything (`20261030090000_birthday_cards.sql`): who
 * manages a card, who signs it, who sees it and when. This reads what it
 * answers, and says it.
 *
 * Whatever the card itself says is lower case but for names (Aalim, on the
 * look): "happy birthday, Ada.", "sign Ada’s card", "14 march". What
 * signers write stays as they wrote it.
 */

/** A message, as the card keeps it. */
export const CARD_MESSAGE_MAX = 2000;

/** A voice memo: two minutes, a little more stored for the encoder's tail. */
export const CARD_VOICE_SECONDS = 120;

/** A photo's longest side once the browser has shrunk it. */
export const CARD_PHOTO_EDGE = 1600;

/** The `cards` bucket's limit, in bytes. */
export const CARD_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** The types the `cards` bucket takes, and the extension each is kept under. */
export const CARD_FILE_TYPES: Readonly<Record<string, string>> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
};

export type CardSignature = {
  id: string;
  /** As the trees name the signer, when they signed. */
  name: string;
  /** The signer's own entry, to say who they are to the person. */
  personId: string | null;
  /** What a link signer said they are to the person (Step 217.3). */
  relation: CardRelation | null;
  /** In the app, through the public link, or through a personal link. */
  cameBy: "app" | "link" | "personal_link";
  message: string | null;
  audioPath: string | null;
  audioSeconds: number | null;
  photoPath: string | null;
  /** The viewer signed it. */
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

export type BirthdayCard = {
  id: string;
  /** Whose birthday. */
  personId: string;
  year: number;
  /** The birthday, `YYYY-MM-DD`. */
  opensOn: string;
  /** Midnight on the day where they live, and the midnight after. */
  opensAt: string;
  closesAt: string;
  /** It's their birthday there, or later. */
  isOpen: boolean;
  /** The viewer may sign it, or change their signature, now. */
  signing: boolean;
  /** Who started it, as the trees name them. */
  startedBy: string;
  /** The person's first look. */
  openedAt: string | null;
  /** The viewer is the person. */
  recipient: boolean;
  /** The viewer manages it: may remove signatures before the day. */
  manager: boolean;
  /** The viewer signed it. */
  signed: boolean;
  /**
   * For a manager: whether the public link is on, and whether they may turn
   * it on (a parent's, for someone under 18). Null for anyone else.
   */
  link: { on: boolean; mayTurnOn: boolean } | null;
  signatures: CardSignature[];
};

/** A signature, with links to its files the server signed. */
export type CardSignatureView = CardSignature & {
  audioUrl: string | null;
  photoUrl: string | null;
};

export type BirthdayCardView = Omit<BirthdayCard, "signatures"> & {
  signatures: CardSignatureView[];
};

/** An earlier card the viewer may open again. */
export type PastCard = { id: string; year: number; opensOn: string; count: number };

/** What a person's sheet shows of their cards to the viewer. */
export type PersonCards = {
  /** To sign, to open, or opened in the last month. */
  current: BirthdayCardView | null;
  past: PastCard[];
  /** For a manager, with no card yet: the birthday one could be started for. */
  startsOn: string | null;
};

/** What the canvas marks: a card the viewer may sign, or their own, ready. */
export type CardFlag = { personId: string; state: "sign" | "mine"; cardId: string };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const EXTENSIONS = [...new Set(Object.values(CARD_FILE_TYPES))].join("|");

/** Where a new file for a card goes: its folder, a fresh name. */
export function cardFilePath(cardId: string, ext: string, id: string): string {
  return `${cardId}/${id}.${ext}`;
}

/** Whether `path` is a file's place in `cardId`'s folder. */
export function isCardFilePath(cardId: string, path: string): boolean {
  return new RegExp(`^${cardId}/${UUID}\\.(${EXTENSIONS})$`).test(path);
}

const text = (v: unknown): string | null =>
  typeof v === "string" && v.length > 0 ? v : null;
const num = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null;
const bool = (v: unknown): boolean => v === true;

function asSignature(value: unknown): CardSignature | null {
  if (!value || typeof value !== "object") return null;
  const s = value as Record<string, unknown>;
  const id = text(s.id);
  if (!id) return null;
  return {
    id,
    name: text(s.name) ?? "A relative",
    personId: text(s.personId),
    relation: asCardRelation(s.relation),
    cameBy: s.cameBy === "link" || s.cameBy === "personal_link" ? s.cameBy : "app",
    message: text(s.message),
    audioPath: text(s.audioPath),
    audioSeconds: num(s.audioSeconds),
    photoPath: text(s.photoPath),
    mine: bool(s.mine),
    createdAt: text(s.createdAt) ?? "",
    updatedAt: text(s.updatedAt) ?? "",
  };
}

/** A card as `card_json` answers it, or null for anything else. */
export function asBirthdayCard(value: unknown): BirthdayCard | null {
  if (!value || typeof value !== "object") return null;
  const c = value as Record<string, unknown>;
  const id = text(c.id);
  const personId = text(c.personId);
  const opensOn = text(c.opensOn);
  if (!id || !personId || !opensOn) return null;
  const link = c.link && typeof c.link === "object" ? (c.link as Record<string, unknown>) : null;
  return {
    id,
    personId,
    year: num(c.year) ?? Number(opensOn.slice(0, 4)),
    opensOn,
    opensAt: text(c.opensAt) ?? "",
    closesAt: text(c.closesAt) ?? "",
    isOpen: bool(c.isOpen),
    signing: bool(c.signing),
    startedBy: text(c.startedBy) ?? "A relative",
    openedAt: text(c.openedAt),
    recipient: bool(c.recipient),
    manager: bool(c.manager),
    signed: bool(c.signed),
    link: link ? { on: bool(link.on), mayTurnOn: bool(link.mayTurnOn) } : null,
    signatures: Array.isArray(c.signatures)
      ? c.signatures.flatMap((s) => {
          const one = asSignature(s);
          return one ? [one] : [];
        })
      : [],
  };
}

/** `birthday_cards_for`'s answer, its card's files not yet linked. */
export function asPersonCards(value: unknown): {
  current: BirthdayCard | null;
  past: PastCard[];
  startsOn: string | null;
} {
  const o = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  const past = Array.isArray(o.past)
    ? o.past.flatMap((p): PastCard[] => {
        if (!p || typeof p !== "object") return [];
        const r = p as Record<string, unknown>;
        const id = text(r.id);
        const opensOn = text(r.opensOn);
        if (!id || !opensOn) return [];
        return [{ id, opensOn, year: num(r.year) ?? Number(opensOn.slice(0, 4)), count: num(r.count) ?? 0 }];
      })
    : [];
  return { current: asBirthdayCard(o.current), past, startsOn: text(o.startsOn) };
}

/** Every file a card's signatures keep, to sign links for. */
export function cardFiles(card: BirthdayCard): string[] {
  return card.signatures.flatMap((s) =>
    [s.audioPath, s.photoPath].filter((p): p is string => !!p),
  );
}

/** A card with each file's signed link, or null where none came. */
export function withLinks(card: BirthdayCard, links: ReadonlyMap<string, string>): BirthdayCardView {
  return {
    ...card,
    signatures: card.signatures.map((s) => ({
      ...s,
      audioUrl: s.audioPath ? (links.get(s.audioPath) ?? null) : null,
      photoUrl: s.photoPath ? (links.get(s.photoPath) ?? null) : null,
    })),
  };
}

/** "14 march", from `YYYY-MM-DD`: the card's own lower case. */
export function cardDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  const month = MONTH_NAMES[(m ?? 1) - 1] ?? "";
  return `${d} ${month.toLowerCase()}`;
}

/** "Ada’s", "James’s": names keep their capitals. */
export function possessive(name: string): string {
  return `${name}’s`;
}

/** "Chidi has signed", "Chidi and Ngozi have signed", "Chidi, Ngozi and Bisi have signed". */
export function signedSoFar(names: readonly string[]): string {
  if (names.length === 0) return "nobody has signed yet";
  if (names.length === 1) return `${names[0]} has signed`;
  const head = names.slice(0, -1).join(", ");
  return `${head} and ${names[names.length - 1]} have signed`;
}

/** "Chidi, Ifeoma, Ngozi and Bisi signed your card." */
export function signedYourCard(names: readonly string[]): string {
  if (names.length === 0) return "your card is here.";
  if (names.length === 1) return `${names[0]} signed your card.`;
  const shown = names.length > 6 ? [...names.slice(0, 5), `${names.length - 5} more`] : names;
  return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]} signed your card.`;
}

/** Signatures two at a time, as a wide screen opens the card like a book. */
export function spreads<T>(items: readonly T[], per = 2): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += per) out.push(items.slice(i, i + per));
  return out;
}

/** What each refusal from the card's calls means. */
export const CARD_ERRORS = [
  ["not yours to start", "Only their spouse, parents or a Root can start their card."],
  ["not on ancestree", "Cards are only for people with an account."],
  ["no birthday", "Add their birthday, with the day, first."],
  ["too early", "A card can be started up to a month before the day."],
  ["not open for you to sign", "This card isn’t open for you to sign."],
  ["nothing to sign with", "Write a message, record one or add a photo."],
  ["longer than a message may be", `Keep it under ${CARD_MESSAGE_MAX.toLocaleString("en")} characters.`],
  ["longer than a voice memo may be", "Keep the voice memo under two minutes."],
  ["didn't arrive", "A file didn’t upload. Try again."],
  ["not yours to take off", "Only its signer can take that off now."],
  ["not yours to delete", "Only its managers can delete a card, before the day."],
] as const;
