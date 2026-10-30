import { describe, expect, it } from "vitest";

import {
  cardFunnelGroups,
  cardSharesBreakdown,
  cardsCountedSince,
  readCardFunnel,
  signedBreakdown,
} from "@/lib/card-funnel";

const answer = {
  today: "2026-10-30",
  counted_from: "2026-10-30",
  cards: [
    {
      id: "c1",
      opens_on: "2026-11-14",
      first_name: "Ada",
      tree_name: "The Okafor Family",
      owner: "outside",
      signatures: 4,
      links: 2,
      personal_links: 1,
      shared: 3,
      shares_by: { whatsapp: 2, copy: 1, carrier_pigeon: 9 },
      opened: 7,
      signed: 4,
      signed_by: { app: 1, link: 2, personal_link: 1 },
      join_shown: 2,
      asked: 1,
      claimed: 1,
    },
    { id: "c2", opens_on: "2026-12-01", owner: "test", signatures: -3 },
    { id: "c3" },
  ],
};

describe("readCardFunnel", () => {
  it("reads each card, keeping only counts it knows", () => {
    const funnel = readCardFunnel(answer)!;
    expect(funnel.cards.map((c) => c.id)).toEqual(["c1", "c2"]);
    const [ada, test] = funnel.cards;
    expect(ada.sharesBy).toEqual({ share: 0, whatsapp: 2, messages: 0, copy: 1 });
    expect(cardSharesBreakdown(ada)).toEqual(["WhatsApp 2", "copy 1"]);
    expect(signedBreakdown(ada)).toEqual(["app 1", "link 2", "personal link 1"]);
    expect(test.signatures).toBe(0);
    expect(readCardFunnel({})).toBeNull();
  });

  it("groups outside founders first and says since when", () => {
    const funnel = readCardFunnel(answer)!;
    expect(cardFunnelGroups(funnel).map((g) => g.title)).toEqual(["Outside founders", "Test accounts"]);
    expect(cardsCountedSince(funnel)).toBe("Counted since 30 Oct 2026");
    expect(cardsCountedSince({ ...funnel, countedFrom: "2026-09-01" })).toBeNull();
  });
});
