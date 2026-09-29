import { describe, expect, it } from "vitest";

import { countOf, plural } from "@/lib/plural";

describe("plural (Step 77.4)", () => {
  it("is singular for one only", () => {
    expect(plural(1, "entry", "entries")).toBe("entry");
    expect(plural(0, "entry", "entries")).toBe("entries");
    expect(plural(2, "member")).toBe("members");
    expect(plural(1, "needs", "need")).toBe("needs");
  });

  it("puts the count before its word", () => {
    expect(countOf(1, "open flag")).toBe("1 open flag");
    expect(countOf(3, "person", "people")).toBe("3 people");
    expect(countOf(0, "ancestor")).toBe("0 ancestors");
  });
});
