import { describe, expect, it } from "vitest";

import {
  TREE_REQUEST_RECEIVED,
  toTreeRequestStatus,
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
      "We’ll let you know when you can start your tree.",
    );
  });
});
