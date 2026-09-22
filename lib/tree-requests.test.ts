import { describe, expect, it } from "vitest";

import {
  TREE_REQUEST_RECEIVED,
  toTreeRequestStatus,
  waitlistReceived,
} from "@/lib/tree-requests";

describe("toTreeRequestStatus", () => {
  it("keeps each status my_tree_request reports", () => {
    expect(toTreeRequestStatus("none")).toBe("none");
    expect(toTreeRequestStatus("pending")).toBe("pending");
    expect(toTreeRequestStatus("approved")).toBe("approved");
    expect(toTreeRequestStatus("founded")).toBe("founded");
  });

  it("takes anything else as not having asked", () => {
    expect(toTreeRequestStatus(null)).toBe("none");
    expect(toTreeRequestStatus(undefined)).toBe("none");
    expect(toTreeRequestStatus("declined")).toBe("none");
    expect(toTreeRequestStatus(true)).toBe("none");
  });
});

describe("what an ask says once it's in", () => {
  it("tells a member they'll hear when they can start", () => {
    expect(TREE_REQUEST_RECEIVED).toBe(
      "Your request has been received. We’ll notify you when you can start building a new tree.",
    );
  });

  it("tells someone on the waitlist where they'll hear", () => {
    expect(waitlistReceived("zahra@example.com")).toBe(
      "Your request has been received. We’ll email you at zahra@example.com when you can start building a new tree.",
    );
  });
});
