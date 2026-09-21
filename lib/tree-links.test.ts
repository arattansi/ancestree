import { describe, expect, it } from "vitest";

import {
  addRelativeHref,
  treeFocusHref,
  validRelatedTo,
} from "@/lib/tree-links";

describe("treeFocusHref", () => {
  it("opens the canvas on the person just added", () => {
    expect(treeFocusHref("abc-123")).toBe("/tree?person=abc-123");
  });

  it("falls back to the plain canvas without an id", () => {
    expect(treeFocusHref(undefined)).toBe("/tree");
    expect(treeFocusHref(null)).toBe("/tree");
    expect(treeFocusHref("")).toBe("/tree");
  });

  it("encodes the id", () => {
    expect(treeFocusHref("a&b=c")).toBe("/tree?person=a%26b%3Dc");
  });
});

describe("addRelativeHref", () => {
  it("carries the selected person as relatedTo", () => {
    expect(addRelativeHref("p1")).toBe("/people/new?relatedTo=p1");
  });

  it("is the plain flow with nobody selected", () => {
    expect(addRelativeHref(null)).toBe("/people/new");
  });
});

describe("validRelatedTo", () => {
  const members = ["p1", "p2"];

  it("keeps an id that is on the tree", () => {
    expect(validRelatedTo("p2", members)).toBe("p2");
  });

  it("ignores someone not on the tree", () => {
    expect(validRelatedTo("p9", members)).toBeNull();
  });

  it("ignores a missing, empty or repeated parameter", () => {
    expect(validRelatedTo(undefined, members)).toBeNull();
    expect(validRelatedTo("", members)).toBeNull();
    expect(validRelatedTo(["p1", "p2"], members)).toBeNull();
  });
});
