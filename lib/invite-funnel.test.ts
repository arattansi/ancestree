import { describe, expect, it } from "vitest";

import {
  countedSince,
  funnelGroups,
  joinsBreakdown,
  readInviteFunnel,
  sharesBreakdown,
  totalOf,
} from "@/lib/invite-funnel";

/** What `invite_funnel()` answers, shaped as the rehearsal's (names made up). */
const ANSWER = {
  today: "2026-10-28",
  counted_from: "2026-10-28",
  trees: [
    {
      id: "t1",
      name: "The Okafor Family",
      roots: ["Chidi Okafor"],
      owner: "outside",
      made: 2,
      shared: 2,
      shares: 3,
      shares_by: { whatsapp: 2, copy: 1 },
      opened: 4,
      code_sent: 1,
      joined: 2,
      joined_by: { name: 1, email_code: 1 },
      email_added: 1,
    },
    {
      id: "t2",
      name: "Family",
      roots: ["Ada Mensah"],
      owner: "outside",
      made: 1,
      shared: 1,
      shares: 1,
      shares_by: { email: 1 },
      opened: 0,
      code_sent: 0,
      joined: 0,
      joined_by: {},
      email_added: 0,
    },
    {
      id: "t3",
      name: "Rehearsal 216",
      roots: ["Rehearsal Founder"],
      owner: "test",
      made: 1,
      shared: 0,
      shares: 0,
      shares_by: {},
      opened: 1,
      code_sent: 0,
      joined: 1,
      joined_by: { unknown: 1 },
      email_added: 0,
    },
  ],
};

describe("readInviteFunnel", () => {
  it("reads every count, by button and by path", () => {
    const f = readInviteFunnel(ANSWER);
    expect(f?.today).toBe("2026-10-28");
    expect(f?.trees).toHaveLength(3);
    const okafor = f!.trees[0];
    expect(okafor).toMatchObject({
      owner: "outside",
      made: 2,
      shared: 2,
      opened: 4,
      codeSent: 1,
      joined: 2,
      emailAdded: 1,
    });
    expect(okafor.sharesBy).toEqual({ share: 0, whatsapp: 2, messages: 0, copy: 1, email: 0 });
    expect(okafor.joinedBy).toEqual({
      name: 1,
      email_code: 1,
      emailed_invite: 0,
      signed_in: 0,
      unknown: 0,
    });
  });

  it("isn't fooled by what isn't the funnel", () => {
    expect(readInviteFunnel(null)).toBeNull();
    expect(readInviteFunnel({ trees: [] })).toBeNull();
    const f = readInviteFunnel({
      today: "2026-10-28",
      counted_from: null,
      trees: [{ id: "x", name: "X", owner: "someone", made: -3, shares_by: { fax: 9 } }, "nope"],
    });
    expect(f?.countedFrom).toBeNull();
    expect(f?.trees).toHaveLength(1);
    expect(f?.trees[0]).toMatchObject({ owner: "outside", made: 0, roots: [] });
    expect(f?.trees[0].sharesBy).not.toHaveProperty("fax");
  });
});

describe("funnelGroups", () => {
  it("puts outside founders first and leaves out empty groups", () => {
    const groups = funnelGroups(readInviteFunnel(ANSWER)!);
    expect(groups.map((g) => g.owner)).toEqual(["outside", "test"]);
    expect(groups[0].title).toBe("Outside founders");
    expect(groups[0].total).toMatchObject({ made: 3, shared: 3, opened: 4, joined: 2 });
    expect(groups[0].total.sharesBy).toMatchObject({ whatsapp: 2, copy: 1, email: 1 });
  });

  it("adds nothing up to zeros", () => {
    expect(totalOf([])).toMatchObject({ made: 0, joined: 0, emailAdded: 0 });
  });
});

describe("breakdowns", () => {
  it("names each button and path that has any", () => {
    const [okafor, , test] = readInviteFunnel(ANSWER)!.trees;
    expect(sharesBreakdown(okafor)).toEqual(["WhatsApp 2", "copy 1"]);
    expect(joinsBreakdown(okafor)).toEqual(["name 1", "email code 1"]);
    expect(joinsBreakdown(test)).toEqual(["other 1"]);
    expect(sharesBreakdown(test)).toEqual([]);
  });
});

describe("countedSince", () => {
  it("says when counting began while that's within the 30 days", () => {
    const f = readInviteFunnel(ANSWER)!;
    expect(countedSince(f)).toBe("Counted since 28 Oct 2026");
    expect(countedSince({ ...f, today: "2026-11-26" })).toBe("Counted since 28 Oct 2026");
    expect(countedSince({ ...f, today: "2026-11-27" })).toBeNull();
    expect(countedSince({ ...f, countedFrom: null })).toBeNull();
  });
});
