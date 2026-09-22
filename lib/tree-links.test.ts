import { describe, expect, it } from "vitest";

import {
  addRelativeHref,
  adminHref,
  editPersonHref,
  onboardingHref,
  reviewHref,
  treeFocusHref,
  treeHref,
  validRelatedTo,
} from "@/lib/tree-links";

describe("tree paths (Step 25)", () => {
  it("puts every tree page under its slug", () => {
    expect(treeHref("rattansi")).toBe("/t/rattansi/tree");
    expect(reviewHref("rattansi")).toBe("/t/rattansi/tree/review");
    expect(adminHref("rattansi")).toBe("/t/rattansi/admin");
    expect(adminHref("rattansi", "placements")).toBe("/t/rattansi/admin#placements");
    expect(onboardingHref("rattansi")).toBe("/t/rattansi/onboarding");
    expect(editPersonHref("rattansi", "p1")).toBe("/t/rattansi/people/p1/edit");
  });

  it("encodes the slug", () => {
    expect(treeHref("a b")).toBe("/t/a%20b/tree");
  });
});

describe("treeFocusHref", () => {
  it("opens the canvas on the person just added", () => {
    expect(treeFocusHref("t", "abc-123")).toBe("/t/t/tree?person=abc-123");
  });

  it("falls back to the plain canvas without an id", () => {
    expect(treeFocusHref("t", undefined)).toBe("/t/t/tree");
    expect(treeFocusHref("t", null)).toBe("/t/t/tree");
    expect(treeFocusHref("t", "")).toBe("/t/t/tree");
  });

  it("encodes the id", () => {
    expect(treeFocusHref("t", "a&b=c")).toBe("/t/t/tree?person=a%26b%3Dc");
  });
});

describe("addRelativeHref", () => {
  it("carries the selected person as relatedTo", () => {
    expect(addRelativeHref("t", "p1")).toBe("/t/t/people/new?relatedTo=p1");
  });

  it("is the plain flow with nobody selected", () => {
    expect(addRelativeHref("t", null)).toBe("/t/t/people/new");
    expect(addRelativeHref("t")).toBe("/t/t/people/new");
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
