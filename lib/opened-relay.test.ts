import { describe, expect, it } from "vitest";

import { RELAY_ANSWERED } from "@/lib/invite-relays";
import { openedRelayNote, type OpenedRelay } from "@/lib/opened-relay";

const zed: OpenedRelay = {
  status: "invited",
  firstName: "Zed",
  lastName: "Qadri",
  treeName: "Qadri Family",
};

describe("openedRelayNote (Step 41.1)", () => {
  it("says who they invited, and to which tree", () => {
    // Just now from the card, whose refresh keeps the email's address, or
    // earlier: either way it's their own answer, not someone else's.
    expect(openedRelayNote(zed)).toBe("You’ve invited Zed Qadri to Qadri Family.");
  });

  it("leaves the tree out once it's gone", () => {
    expect(openedRelayNote({ ...zed, treeName: null })).toBe("You’ve invited Zed Qadri.");
  });

  it("says they dismissed it, and that the newcomer isn't told", () => {
    expect(openedRelayNote({ ...zed, status: "dismissed", treeName: null })).toBe(
      "You’ve dismissed Zed Qadri’s request. They aren’t told.",
    );
  });

  it("says only that it's been answered when it isn't theirs to read", () => {
    // Signed in as someone else, or the ask is gone: RLS shows nothing.
    expect(openedRelayNote(null)).toBe(RELAY_ANSWERED);
  });

  it("says only that it's been answered for any other state", () => {
    expect(openedRelayNote({ ...zed, status: "pending" })).toBe(RELAY_ANSWERED);
  });
});
