import { cardDay, possessive, type CardSignatureView } from "@/lib/birthday-cards";
import { asCardInk, type CardInk } from "@/lib/card-ink";
import {
  asCardRelation,
  relationLabel,
  type CardRelation,
} from "@/lib/card-relations";

/**
 * A birthday card's links (Step 217.3): one public link a card, for the
 * family chat, and a personal link for a relative on the tree with no
 * account, which is also their claim link. Whoever holds one signs at
 * `/c/<token>`, signed in as themself or signed out with their name; the
 * database decides everything (`20261030120000_birthday_card_links.sql`).
 * This holds the words, and reads what the page is answered.
 *
 * The card's own words are lower case but for names (Aalim).
 */

/** "her", "his", "their", by what the entry says. */
export function pronounOf(sex: string | null | undefined): "her" | "his" | "their" {
  return sex === "female" ? "her" : sex === "male" ? "his" : "their";
}

/**
 * What a link signer is to the person, from whose side it's read: "her
 * cousin" (`whose` = "her"), "your cousin", "Ada’s cousin"; "family" for
 * other family, "a friend" for a friend.
 */
export function relationWords(relation: CardRelation | null, whose: string): string | null {
  if (!relation) return null;
  if (relation === "friend") return "a friend";
  if (relation === "other_family") return "family";
  return `${whose} ${relationLabel(relation)}`;
}

/** The message a manager sends with the link: "It’s Ada’s birthday on 14 march. Sign her card: …". */
export function cardLinkMessage(input: {
  url: string;
  firstName: string;
  opensOn: string;
  sex: string | null | undefined;
}): string {
  return `It’s ${possessive(input.firstName)} birthday on ${cardDay(input.opensOn)}. Sign ${pronounOf(input.sex)} card: ${input.url}`;
}

/** A link's token, as `/c/<token>` carries it: 144 bits as URL-safe base64. */
export function isCardLinkToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{24}$/.test(value);
}

/** Where a link's page is, on `site`. */
export function cardLinkUrl(site: string, token: string): string {
  return `${site}/c/${token}`;
}

/**
 * The cookie holding a browser's random secret for cards' links: the hash
 * of it with a card is a signed-out signer's edit token, and with the day
 * counts their signatures. httpOnly; the database never sees it whole.
 */
export const CARD_SECRET_COOKIE = "ancestree-card";

/** As long as a browser keeps a cookie (400 days). */
export const CARD_SECRET_MAX_AGE = 60 * 60 * 24 * 400;

/** A secret we made: 32 random bytes as URL-safe base64. */
export function isCardSecret(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{32,64}$/.test(value);
}

/** One signature as the link's page shows it, once the viewer has signed. */
export type CardLinkSignature = {
  id: string;
  name: string;
  relation: CardRelation | null;
  message: string | null;
  audioPath: string | null;
  audioSeconds: number | null;
  photoPath: string | null;
  ink: CardInk | null;
  mine: boolean;
  createdAt: string;
  updatedAt: string;
};

/** The viewer's own signature, to change or take off. */
export type CardLinkMine = {
  id: string;
  name: string;
  relation: CardRelation | null;
  message: string | null;
  audioPath: string | null;
  audioSeconds: number | null;
  photoPath: string | null;
  ink: CardInk | null;
  updatedAt: string;
};

/** What `card_link_view` answers for a live link. */
export type CardLinkLive = {
  state: "live";
  cardId: string;
  linkId: string;
  kind: "public" | "personal";
  firstName: string;
  sex: string | null;
  opensOn: string;
  opensAt: string;
  closesAt: string;
  isOpen: boolean;
  /** Signing still open through this link. */
  signing: boolean;
  /** Who started the card: "Chidi is collecting messages." */
  collector: string;
  /** For their leaf, unless they hide their entry from visitors. */
  birthplace: { city: string | null; country: string | null } | null;
  photoPath: string | null;
  photoCrop: unknown;
  /** Signed in and on a tree the person is on. */
  member: boolean;
  /** Signed in: as the trees name them. */
  viewerName: string | null;
  /** A personal link's relative, as the tree names them. */
  personal: { name: string } | null;
  /** A personal link, once signed: their claim link's token. */
  claimToken: string | null;
  mine: CardLinkMine | null;
  /** Show the join button (decision 11). */
  joinable: boolean;
  /** Everyone's, once the viewer has signed; null before. */
  signatures: CardLinkSignature[] | null;
};

export type CardLinkView =
  | { state: "gone" }
  | { state: "peek"; firstName: string; opensOn: string }
  | CardLinkLive;

const text = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const bool = (v: unknown): boolean => v === true;
const fields = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

function asMine(value: unknown): CardLinkMine | null {
  const m = fields(value);
  const id = m && text(m.id);
  if (!m || !id) return null;
  return {
    id,
    name: text(m.name) ?? "",
    relation: asCardRelation(m.relation),
    message: text(m.message),
    audioPath: text(m.audioPath),
    audioSeconds: num(m.audioSeconds),
    photoPath: text(m.photoPath),
    ink: asCardInk(m.ink),
    updatedAt: text(m.updatedAt) ?? "",
  };
}

function asLinkSignature(value: unknown): CardLinkSignature | null {
  const s = fields(value);
  const id = s && text(s.id);
  if (!s || !id) return null;
  return {
    id,
    name: text(s.name) ?? "A relative",
    relation: asCardRelation(s.relation),
    message: text(s.message),
    audioPath: text(s.audioPath),
    audioSeconds: num(s.audioSeconds),
    photoPath: text(s.photoPath),
    ink: asCardInk(s.ink),
    mine: bool(s.mine),
    createdAt: text(s.createdAt) ?? "",
    updatedAt: text(s.updatedAt) ?? "",
  };
}

/** What `card_link_view` answered, or null for a token that opens nothing. */
export function asCardLinkView(raw: unknown): CardLinkView | null {
  const v = fields(raw);
  if (!v) return null;
  if (v.state === "gone") return { state: "gone" };
  if (v.state === "peek") {
    const firstName = text(v.firstName);
    const opensOn = text(v.opensOn);
    return firstName && opensOn ? { state: "peek", firstName, opensOn } : null;
  }
  if (v.state !== "live") return null;
  const cardId = text(v.cardId);
  const linkId = text(v.linkId);
  const firstName = text(v.firstName);
  const opensOn = text(v.opensOn);
  if (!cardId || !linkId || !firstName || !opensOn) return null;
  const birthplace = fields(v.birthplace);
  const personal = fields(v.personal);
  return {
    state: "live",
    cardId,
    linkId,
    kind: v.kind === "personal" ? "personal" : "public",
    firstName,
    sex: text(v.sex),
    opensOn,
    opensAt: text(v.opensAt) ?? "",
    closesAt: text(v.closesAt) ?? "",
    isOpen: bool(v.isOpen),
    signing: bool(v.signing),
    collector: text(v.collector) ?? "A relative",
    birthplace: birthplace ? { city: text(birthplace.city), country: text(birthplace.country) } : null,
    photoPath: text(v.photoPath),
    photoCrop: v.photoCrop ?? null,
    member: bool(v.member),
    viewerName: text(v.viewerName),
    personal: personal ? { name: text(personal.name) ?? "" } : null,
    claimToken: text(v.claimToken),
    mine: asMine(v.mine),
    joinable: bool(v.joinable),
    signatures: Array.isArray(v.signatures)
      ? v.signatures.flatMap((s) => {
          const one = asLinkSignature(s);
          return one ? [one] : [];
        })
      : null,
  };
}

/** A link signature as a card's page draws it, its files' links beside. */
export function asPageSignature(
  s: CardLinkSignature,
  links: ReadonlyMap<string, string>,
): CardSignatureView {
  return {
    id: s.id,
    name: s.name,
    personId: null,
    relation: s.relation,
    cameBy: "link",
    message: s.message,
    audioPath: s.audioPath,
    audioSeconds: s.audioSeconds,
    photoPath: s.photoPath,
    ink: s.ink,
    mine: s.mine,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    audioUrl: s.audioPath ? (links.get(s.audioPath) ?? null) : null,
    photoUrl: s.photoPath ? (links.get(s.photoPath) ?? null) : null,
  };
}

/**
 * Who the link's form asks how they know the person: anyone signing
 * through the public link who isn't on one of their trees. A personal
 * link's relative is on the tree already.
 */
export function asksHowTheyKnow(view: Pick<CardLinkLive, "kind" | "member">): boolean {
  return view.kind === "public" && !view.member;
}

/** What the join card says under its title: "you’re her cousin. a Root of the tree looks at each ask." */
export function joinLine(relation: CardRelation | null, sex: string | null): string {
  const words = relationWords(relation, pronounOf(sex));
  const you = relation === "other_family" ? "you’re family" : words ? `you’re ${words}` : "you’re family";
  return `${you}. a Root of the tree looks at each ask.`;
}

/** What each refusal from the link's calls means. */
export const CARD_LINK_ERRORS = [
  ["not yours to share", "Only the card’s managers can share it."],
  ["only a parent can share it", "Only a parent can share the card of someone under 18."],
  ["signing has closed", "Signing has closed."],
  ["not one to send a link", "They can’t be sent a link."],
  ["claim link didn't work", "Couldn’t make their link. Try again."],
  ["this link no longer works", "This link no longer works."],
  ["no peeking", "No peeking. It’s your card."],
  ["no signer", "Couldn’t sign. Reload the page and try again."],
  ["not a file the card takes", "That file can’t go on a card."],
  ["this card is full", "This card is full."],
  ["three cards a day", "That’s three cards today from this browser. Try again tomorrow."],
  ["too many files", "Too many files today. Try again tomorrow."],
  ["too many right now", "Too many people are signing right now. Try again in a little while."],
  ["nothing to sign with", "Write a message, record one, add a photo or draw."],
  ["not ink the card takes", "That drawing can’t go on the card. Clear it and try again."],
  ["longer than a message may be", "Keep it under 2,000 characters."],
  ["longer than a voice memo may be", "Keep the voice memo under two minutes."],
  ["not a relation", "Say how you know them."],
  ["didn't arrive", "A file didn’t upload. Try again."],
  ["a name to sign with", "Enter your name."],
  ["a shorter name", "That name is too long."],
  ["not yours to take off", "That isn’t yours to take off."],
  ["sign first", "Sign the card first."],
  ["already on the tree", "You’re on the tree already."],
  ["not one to join", "Ask the family to add you."],
  ["a name and an email", "Enter your first and last name and your email."],
] as const;

/** A relative a manager could send their own link: on the tree, with no account. */
export type CardRelative = {
  personId: string;
  name: string;
  firstName: string;
  sex: string | null;
  /** The tree they'd join, where the manager may invite them to claim it. */
  treeId: string;
  /** They've signed through their link already. */
  signed: boolean;
};

/** What `card_personal_candidates` answers. */
export function asCardRelatives(raw: unknown): CardRelative[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): CardRelative[] => {
    const f = fields(r);
    const personId = f && text(f.personId);
    const treeId = f && text(f.treeId);
    if (!f || !personId || !treeId) return [];
    const name = text(f.name) ?? "";
    return [
      {
        personId,
        name,
        firstName: text(f.firstName) ?? name.split(" ")[0] ?? "",
        sex: text(f.sex),
        treeId,
        signed: bool(f.signed),
      },
    ];
  });
}

/**
 * What a Root's queue says of an Ask to join sent from someone's card:
 * "From Ada’s birthday card, as her cousin." The console's own sentence
 * case; the person's name as their entry has it.
 */
export function askedFromCard(input: {
  person: { first_name: string | null; preferred_name: string | null; sex: string | null } | null;
  relation: CardRelation | null;
}): string {
  const p = input.person;
  const first = p?.preferred_name?.trim() || p?.first_name?.trim();
  const card = first ? `From ${possessive(first)} birthday card` : "From a birthday card";
  const words = relationWords(input.relation, pronounOf(p?.sex));
  return words ? `${card}, as ${words}.` : `${card}.`;
}
