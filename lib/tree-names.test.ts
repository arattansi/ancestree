import { describe, expect, it } from "vitest";

import { defaultTreeName } from "@/lib/tree-names";

describe("defaultTreeName", () => {
  it("calls the first tree Family", () => {
    expect(defaultTreeName(0)).toBe("Family");
  });

  it("counts the ones after it in words", () => {
    expect(defaultTreeName(1)).toBe("Second Family");
    expect(defaultTreeName(2)).toBe("Third Family");
    expect(defaultTreeName(9)).toBe("Tenth Family");
  });

  it("switches to figures past tenth", () => {
    expect(defaultTreeName(10)).toBe("11th Family");
    expect(defaultTreeName(11)).toBe("12th Family");
    expect(defaultTreeName(12)).toBe("13th Family");
    expect(defaultTreeName(20)).toBe("21st Family");
    expect(defaultTreeName(21)).toBe("22nd Family");
    expect(defaultTreeName(22)).toBe("23rd Family");
  });

  it("treats nonsense counts as none", () => {
    expect(defaultTreeName(-3)).toBe("Family");
    expect(defaultTreeName(0.7)).toBe("Family");
  });
});
