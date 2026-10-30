import { describe, expect, it } from "vitest";

import { asBirthdayCard } from "@/lib/birthday-cards";
import {
  askedFromCard,
  asCardLinkView,
  asCardRelatives,
  asksHowTheyKnow,
  asPageSignature,
  cardLinkMessage,
  cardLinkUrl,
  isCardLinkToken,
  isCardSecret,
  joinLine,
  pronounOf,
  relationWords,
} from "@/lib/card-links";
import { asCardRelation, CARD_FAMILY_RELATIONS, relationLabel } from "@/lib/card-relations";

const CARD = "ef528273-d449-4986-9f7c-67732b097414";
const LINK = "0b8b1f0a-6c37-4a8e-9a3e-217300000001";

describe("relations", () => {
  it("keeps only the words the database does", () => {
    expect(asCardRelation("cousin")).toBe("cousin");
    expect(asCardRelation("friend")).toBe("friend");
    expect(asCardRelation("in_law")).toBe("in_law");
    expect(asCardRelation("Cousin")).toBeNull();
    expect(asCardRelation("stranger")).toBeNull();
    expect(asCardRelation(null)).toBeNull();
  });

  it("names each in the form's list", () => {
    expect(relationLabel("in_law")).toBe("in-law");
    expect(relationLabel("other_family")).toBe("other family");
    expect(CARD_FAMILY_RELATIONS.map(relationLabel)).toContain("granddaughter");
  });

  it("says what a signer is to the person, from whose side", () => {
    expect(relationWords("cousin", "her")).toBe("her cousin");
    expect(relationWords("in_law", "your")).toBe("your in-law");
    expect(relationWords("aunt", "Ada’s")).toBe("Ada’s aunt");
    expect(relationWords("other_family", "her")).toBe("family");
    expect(relationWords("friend", "her")).toBe("a friend");
    expect(relationWords(null, "her")).toBeNull();
  });

  it("takes the person's pronoun from their entry", () => {
    expect(pronounOf("female")).toBe("her");
    expect(pronounOf("male")).toBe("his");
    expect(pronounOf(null)).toBe("their");
    expect(pronounOf("unknown")).toBe("their");
  });
});

describe("the link", () => {
  it("is 144 bits of URL-safe base64", () => {
    expect(isCardLinkToken("Ab3_-x9QwErTyUiOpAsDfGh2")).toBe(true);
    expect(isCardLinkToken("Ab3_-x9QwErTyUiOpAsDfGh")).toBe(false);
    expect(isCardLinkToken("Ab3_-x9QwErTyUiOpAsDfGh+")).toBe(false);
    expect(isCardLinkToken(null)).toBe(false);
  });

  it("has its message ready, the card's words lower case but the name", () => {
    expect(
      cardLinkMessage({
        url: cardLinkUrl("https://www.ancestree.space", "Ab3_-x9QwErTyUiOpAsDfGh2"),
        firstName: "Ada",
        opensOn: "2027-03-14",
        sex: "female",
      }),
    ).toBe(
      "It’s Ada’s birthday on 14 march. Sign her card: https://www.ancestree.space/c/Ab3_-x9QwErTyUiOpAsDfGh2",
    );
    expect(cardLinkMessage({ url: "u", firstName: "Sam", opensOn: "2026-11-02", sex: null })).toBe(
      "It’s Sam’s birthday on 2 november. Sign their card: u",
    );
  });

  it("keeps a browser's secret only as we made it", () => {
    expect(isCardSecret("a".repeat(43))).toBe(true);
    expect(isCardSecret("a".repeat(31))).toBe(false);
    expect(isCardSecret("a b".repeat(15))).toBe(false);
  });
});

const live = {
  state: "live",
  cardId: CARD,
  linkId: LINK,
  kind: "public",
  firstName: "Ada",
  sex: "female",
  opensOn: "2026-11-14",
  opensAt: "2026-11-13T23:00:00+00:00",
  closesAt: "2026-11-14T23:00:00+00:00",
  isOpen: false,
  signing: true,
  collector: "Chidi",
  birthplace: { city: "Enugu", country: "Nigeria" },
  photoPath: null,
  photoCrop: null,
  member: false,
  viewerName: null,
  personal: null,
  claimToken: null,
  mine: null,
  joinable: false,
  signatures: null,
};

describe("asCardLinkView", () => {
  it("reads a link nobody has signed through yet: nothing of the others", () => {
    const view = asCardLinkView(live);
    expect(view?.state).toBe("live");
    if (view?.state !== "live") return;
    expect(view.signatures).toBeNull();
    expect(view.mine).toBeNull();
    expect(view.birthplace).toEqual({ city: "Enugu", country: "Nigeria" });
    expect(asksHowTheyKnow(view)).toBe(true);
  });

  it("reads a signer's page: theirs, and everyone's", () => {
    const view = asCardLinkView({
      ...live,
      mine: { id: "s9", name: "Emeka Obi", relation: "cousin", message: "hi", updatedAt: "x" },
      joinable: true,
      signatures: [
        { id: "s1", name: "Chidi Okafor", relation: null, message: "from the app", mine: false },
        { id: "s9", name: "Emeka Obi", relation: "cousin", message: "hi", mine: true },
        { name: "no id" },
      ],
    });
    if (view?.state !== "live") throw new Error("not live");
    expect(view.mine?.relation).toBe("cousin");
    expect(view.signatures?.map((s) => s.id)).toEqual(["s1", "s9"]);
    expect(view.joinable).toBe(true);
  });

  it("reads the person themself, a link turned off, and nothing", () => {
    expect(asCardLinkView({ state: "peek", firstName: "Ada", opensOn: "2026-11-14" })).toEqual({
      state: "peek",
      firstName: "Ada",
      opensOn: "2026-11-14",
    });
    expect(asCardLinkView({ state: "gone" })).toEqual({ state: "gone" });
    expect(asCardLinkView(null)).toBeNull();
    expect(asCardLinkView({ state: "live" })).toBeNull();
  });

  it("doesn't ask a personal link's relative or a member how they know them", () => {
    expect(asksHowTheyKnow({ kind: "personal", member: false })).toBe(false);
    expect(asksHowTheyKnow({ kind: "public", member: true })).toBe(false);
  });
});

describe("a link signature on a card's page", () => {
  it("has no entry, its own words and its files' links", () => {
    const page = asPageSignature(
      {
        id: "s9",
        name: "Emeka Obi",
        relation: "cousin",
        message: null,
        audioPath: `${CARD}/a.m4a`,
        audioSeconds: 12,
        photoPath: `${CARD}/b.jpg`,
        mine: false,
        createdAt: "",
        updatedAt: "",
      },
      new Map([[`${CARD}/a.m4a`, "https://signed/a"]]),
    );
    expect(page.personId).toBeNull();
    expect(page.relation).toBe("cousin");
    expect(page.audioUrl).toBe("https://signed/a");
    expect(page.photoUrl).toBeNull();
  });
});

describe("the card's sheet", () => {
  it("reads a manager's link and each signature's relation and how it came", () => {
    const card = asBirthdayCard({
      id: CARD,
      personId: "p1",
      opensOn: "2026-11-14",
      manager: true,
      link: { on: true, mayTurnOn: false },
      signatures: [
        { id: "s1", name: "Emeka", relation: "cousin", cameBy: "link" },
        { id: "s2", name: "Chidi", relation: "nonsense", cameBy: "smoke signal" },
      ],
    });
    expect(card?.link).toEqual({ on: true, mayTurnOn: false });
    expect(card?.signatures.map((s) => [s.relation, s.cameBy])).toEqual([
      ["cousin", "link"],
      [null, "app"],
    ]);
    expect(asBirthdayCard({ id: CARD, personId: "p1", opensOn: "2026-11-14" })?.link).toBeNull();
  });
});

describe("joining", () => {
  it("says who they said they are", () => {
    expect(joinLine("cousin", "female")).toBe("you’re her cousin. a Root of the tree looks at each ask.");
    expect(joinLine("other_family", "male")).toBe("you’re family. a Root of the tree looks at each ask.");
  });

  it("tells a Root where an ask came from", () => {
    expect(
      askedFromCard({ person: { first_name: "Adaeze", preferred_name: "Ada", sex: "female" }, relation: "son" }),
    ).toBe("From Ada’s birthday card, as her son.");
    expect(askedFromCard({ person: null, relation: null })).toBe("From a birthday card.");
  });

  it("reads who a manager could send their own link", () => {
    expect(
      asCardRelatives([
        { personId: "p2", name: "Ngozi Eze", firstName: "Ngozi", sex: "female", treeId: "t1", signed: false },
        { personId: "p3", name: "No tree" },
        "junk",
      ]),
    ).toEqual([{ personId: "p2", name: "Ngozi Eze", firstName: "Ngozi", sex: "female", treeId: "t1", signed: false }]);
  });
});
