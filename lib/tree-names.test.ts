import { describe, expect, it } from "vitest";

import {
  defaultTreeName,
  isDefaultTreeName,
  suggestedTreeName,
} from "@/lib/tree-names";

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

describe("isDefaultTreeName", () => {
  it("knows every name defaultTreeName gives", () => {
    for (let n = 0; n < 40; n += 1) {
      expect(isDefaultTreeName(defaultTreeName(n))).toBe(true);
    }
  });

  it("ignores stray spaces", () => {
    expect(isDefaultTreeName("  Family ")).toBe(true);
  });

  it("leaves a name someone chose alone", () => {
    expect(isDefaultTreeName("Family Tree")).toBe(false);
    expect(isDefaultTreeName("The Garcia Family")).toBe(false);
    expect(isDefaultTreeName("Garcia Family")).toBe(false);
    expect(isDefaultTreeName("family")).toBe(false);
  });

  it("doesn't take figures the words already cover, or a wrong suffix", () => {
    expect(isDefaultTreeName("2nd Family")).toBe(false);
    expect(isDefaultTreeName("11st Family")).toBe(false);
    expect(isDefaultTreeName("21th Family")).toBe(false);
  });
});

describe("suggestedTreeName", () => {
  it("names the family", () => {
    expect(suggestedTreeName({ lastName: "Garcia" })).toBe("The Garcia Family");
    expect(suggestedTreeName({ lastName: " de la Cruz " })).toBe(
      "The de la Cruz Family",
    );
  });

  it("prefers the family someone was born into", () => {
    expect(suggestedTreeName({ maidenName: "Lakhani", lastName: "Suleman" })).toBe(
      "The Lakhani Family",
    );
  });

  it("passes over a name one of their trees already has", () => {
    expect(
      suggestedTreeName({ lastName: "Tester" }, ["The Tester Family"]),
    ).toBeNull();
    expect(
      suggestedTreeName({ maidenName: "Tester", lastName: "Rivera" }, [
        "the tester family ",
      ]),
    ).toBe("The Rivera Family");
  });

  it("offers nothing without a name to build it from", () => {
    expect(suggestedTreeName({ lastName: "" })).toBeNull();
    expect(suggestedTreeName({ maidenName: null, lastName: null })).toBeNull();
  });
});
