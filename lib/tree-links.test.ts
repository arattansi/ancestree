import { describe, expect, it } from "vitest";

import {
  addRelativeHref,
  adminHref,
  editPersonHref,
  joinedTreeHref,
  onboardingHref,
  onboardingStepHref,
  reviewHref,
  treeFocusHref,
  treeHref,
  validRelatedTo,
} from "@/lib/tree-links";

describe("tree paths", () => {
  it("keeps every tree page at a plain address", () => {
    expect(treeHref()).toBe("/tree");
    expect(reviewHref()).toBe("/tree/review");
    expect(onboardingHref()).toBe("/onboarding");
    expect(onboardingStepHref("family")).toBe("/onboarding?step=family");
    expect(editPersonHref("p1")).toBe("/people/p1/edit");
    expect(editPersonHref("a b")).toBe("/people/a%20b/edit");
  });

  it("opens the admin console as the account page's admin view", () => {
    expect(adminHref()).toBe("/account?view=admin");
    expect(adminHref("placements")).toBe("/account?view=admin#placements");
  });
});

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

describe("joinedTreeHref", () => {
  it("opens the canvas on the entry a claim invite just claimed", () => {
    expect(joinedTreeHref({ selfPersonId: "p1", selfPlaced: true })).toBe(
      "/tree?person=p1",
    );
  });

  it("sends someone with no entry yet to onboarding", () => {
    expect(joinedTreeHref({ selfPersonId: null, selfPlaced: false })).toBe(
      "/onboarding",
    );
  });

  it("sends a member whose entry is on another tree to onboarding", () => {
    expect(joinedTreeHref({ selfPersonId: "p1", selfPlaced: false })).toBe(
      "/onboarding",
    );
  });
});

describe("addRelativeHref", () => {
  it("carries the selected person as relatedTo", () => {
    expect(addRelativeHref("p1")).toBe("/people/new?relatedTo=p1");
  });

  it("is the plain flow with nobody selected", () => {
    expect(addRelativeHref(null)).toBe("/people/new");
    expect(addRelativeHref()).toBe("/people/new");
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
