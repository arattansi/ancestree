import { describe, expect, it } from "vitest";

import {
  asBirthdayCard,
  asPersonCards,
  cardDay,
  cardFilePath,
  cardFiles,
  isCardFilePath,
  signedSoFar,
  signedYourCard,
  spreads,
  withLinks,
} from "@/lib/birthday-cards";

const CARD = "ef528273-d449-4986-9f7c-67732b097414";
const FILE = "00000000-0000-4000-c217-000000000001";

const answer = {
  id: CARD,
  personId: "00000000-0000-4000-b217-000000000002",
  year: 2026,
  opensOn: "2026-11-10",
  opensAt: "2026-11-09T23:00:00+00:00",
  closesAt: "2026-11-10T23:00:00+00:00",
  isOpen: false,
  signing: true,
  startedBy: "Chidi Okafor",
  openedAt: null,
  recipient: false,
  manager: true,
  signed: true,
  signatures: [
    {
      id: "s1",
      name: "Ifeoma Okafor",
      personId: "p4",
      message: "Happy birthday, Mummy!",
      audioPath: `${CARD}/${FILE}.m4a`,
      audioSeconds: 40,
      photoPath: null,
      mine: true,
      createdAt: "2026-10-30T04:00:00Z",
      updatedAt: "2026-10-30T04:00:00Z",
    },
    { id: "s2", name: "Ngozi", message: "Happy birthday, Aunty!", mine: false },
    { id: "s3", name: "Bisi", ink: { sign: [[[0.2, 0.5, 0.5, 0]]] } },
    { id: "s4", name: "Kemi", ink: { draw: "not ink" } },
    { name: "no id, dropped" },
  ],
};

describe("asBirthdayCard", () => {
  it("reads card_json's answer", () => {
    const card = asBirthdayCard(answer);
    expect(card?.opensOn).toBe("2026-11-10");
    expect(card?.manager).toBe(true);
    expect(card?.signatures.map((s) => s.id)).toEqual(["s1", "s2", "s3", "s4"]);
    expect(card?.signatures[1]).toMatchObject({ audioPath: null, mine: false, personId: null, ink: null });
    // Ink (Step 217.4), read as the card takes it; anything else is none.
    expect(card?.signatures[2].ink).toEqual({ sign: [[[0.2, 0.5, 0.5, 0]]] });
    expect(card?.signatures[3].ink).toBeNull();
  });

  it("is null for nothing, or a card without its keys", () => {
    expect(asBirthdayCard(null)).toBeNull();
    expect(asBirthdayCard({ id: CARD })).toBeNull();
  });
});

describe("asPersonCards", () => {
  it("reads the sheet's answer", () => {
    const cards = asPersonCards({
      current: answer,
      past: [{ id: "c0", year: 2025, opensOn: "2025-11-10", count: 9 }, { year: 2024 }],
      startsOn: null,
    });
    expect(cards.current?.id).toBe(CARD);
    expect(cards.past).toEqual([{ id: "c0", year: 2025, opensOn: "2025-11-10", count: 9 }]);
    expect(cards.startsOn).toBeNull();
  });

  it("says nothing for an answer that isn't one", () => {
    expect(asPersonCards(null)).toEqual({ current: null, past: [], startsOn: null });
    expect(asPersonCards({ startsOn: "2026-11-10" }).startsOn).toBe("2026-11-10");
  });
});

describe("files", () => {
  it("puts a file in its card's folder, and knows one there", () => {
    const path = cardFilePath(CARD, "m4a", FILE);
    expect(path).toBe(`${CARD}/${FILE}.m4a`);
    expect(isCardFilePath(CARD, path)).toBe(true);
    expect(isCardFilePath(CARD, `${CARD}/${FILE}.exe`)).toBe(false);
    expect(isCardFilePath(CARD, `other/${FILE}.m4a`)).toBe(false);
    expect(isCardFilePath(CARD, `${CARD}/../${FILE}.m4a`)).toBe(false);
  });

  it("lists a card's files and links them", () => {
    const card = asBirthdayCard(answer)!;
    expect(cardFiles(card)).toEqual([`${CARD}/${FILE}.m4a`]);
    const view = withLinks(card, new Map([[`${CARD}/${FILE}.m4a`, "https://signed"]]));
    expect(view.signatures[0]).toMatchObject({ audioUrl: "https://signed", photoUrl: null });
    expect(view.signatures[1]).toMatchObject({ audioUrl: null, photoUrl: null });
  });
});

describe("words", () => {
  it("says the day in the card's lower case", () => {
    expect(cardDay("2026-03-14")).toBe("14 march");
    expect(cardDay("2026-11-01")).toBe("1 november");
  });

  it("names who has signed", () => {
    expect(signedSoFar([])).toBe("nobody has signed yet");
    expect(signedSoFar(["Chidi"])).toBe("Chidi has signed");
    expect(signedSoFar(["Chidi", "Ngozi", "Bisi"])).toBe("Chidi, Ngozi and Bisi have signed");
  });

  it("names who signed the person's card, and counts past six", () => {
    expect(signedYourCard(["Chidi"])).toBe("Chidi signed your card.");
    expect(signedYourCard(["Chidi", "Ifeoma", "Ngozi", "Bisi"])).toBe(
      "Chidi, Ifeoma, Ngozi and Bisi signed your card.",
    );
    expect(signedYourCard(["a", "b", "c", "d", "e", "f", "g", "h"])).toBe(
      "a, b, c, d, e and 3 more signed your card.",
    );
  });
});

describe("spreads", () => {
  it("pairs pages for a wide screen", () => {
    expect(spreads([1, 2, 3])).toEqual([[1, 2], [3]]);
    expect(spreads([])).toEqual([]);
  });
});
