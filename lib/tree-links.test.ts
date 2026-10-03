import { describe, expect, it } from "vitest";

import {
  addRelativeHref,
  adminHref,
  editPersonHref,
  entryBackHref,
  homeHref,
  joinedTreeHref,
  myFamilyFocusHref,
  myFamilyHref,
  onboardingHref,
  onboardingStepHref,
  openedFromFamily,
  reviewHref,
  storyHref,
  suggestChangeHref,
  switcherShowsMyFamily,
  treeFocusHref,
  treeHref,
  treeStoryHref,
  validRelatedTo,
  welcomeHref,
} from "@/lib/tree-links";

describe("tree paths", () => {
  it("keeps every tree page at a plain address", () => {
    expect(treeHref()).toBe("/tree");
    expect(myFamilyHref()).toBe("/family");
    expect(reviewHref()).toBe("/tree/review");
    expect(onboardingHref()).toBe("/onboarding");
    expect(onboardingStepHref("family")).toBe("/onboarding?step=family");
    expect(editPersonHref("p1")).toBe("/people/p1/edit");
    expect(editPersonHref("a b")).toBe("/people/a%20b/edit");
    expect(suggestChangeHref("p1")).toBe("/people/p1/suggest");
  });

  it("lands on My Family Tree once there's an entry to arrange it around (Step 92.5)", () => {
    expect(homeHref("p1")).toBe("/family");
    expect(homeHref(null)).toBe("/tree");
    expect(homeHref(undefined)).toBe("/tree");
  });

  it("has the header switcher name a tree only on its canvas", () => {
    const base = { hasOwnEntry: true };
    for (const pathname of [
      "/",
      "/family",
      "/account",
      "/tree/review",
      "/people/p1/edit",
    ]) {
      expect(switcherShowsMyFamily({ ...base, pathname })).toBe(true);
    }
    expect(switcherShowsMyFamily({ ...base, pathname: "/tree" })).toBe(false);
    // No entry yet, so no My Family Tree: their tree, except on the view.
    expect(switcherShowsMyFamily({ hasOwnEntry: false, pathname: "/" })).toBe(
      false,
    );
    expect(
      switcherShowsMyFamily({ hasOwnEntry: false, pathname: "/family" }),
    ).toBe(true);
  });

  it("opens the suggestion form on a declined suggestion to resend (Step 71)", () => {
    expect(suggestChangeHref("p1", "s1")).toBe("/people/p1/suggest?from=s1");
    expect(suggestChangeHref("p 1", "s&1")).toBe(
      "/people/p%201/suggest?from=s%261",
    );
  });

  it("sends an entry's pages opened from My Family Tree back there (Step 92.3)", () => {
    expect(editPersonHref("p1", { fromFamily: true })).toBe(
      "/people/p1/edit?back=family",
    );
    expect(suggestChangeHref("p1", undefined, { fromFamily: true })).toBe(
      "/people/p1/suggest?back=family",
    );
    expect(suggestChangeHref("p1", "s1", { fromFamily: true })).toBe(
      "/people/p1/suggest?from=s1&back=family",
    );
    expect(editPersonHref("p1", { fromFamily: false })).toBe("/people/p1/edit");
    expect(openedFromFamily("family")).toBe(true);
    expect(openedFromFamily(["family", "family"])).toBe(false);
    expect(openedFromFamily("tree")).toBe(false);
    expect(openedFromFamily(undefined)).toBe(false);
    expect(entryBackHref("a b", true)).toBe("/family?person=a%20b");
    expect(entryBackHref("p1", false)).toBe("/tree?person=p1");
    expect(myFamilyFocusHref("p1")).toBe("/family?person=p1");
  });

  it("opens the admin console as the account page's admin view", () => {
    expect(adminHref()).toBe("/account?view=admin");
    expect(adminHref("placements")).toBe("/account?view=admin#placements");
  });
});

describe("story links (Step 88.4)", () => {
  it("opens a person's sheet on one story's comments", () => {
    expect(treeStoryHref("p1", "s1")).toBe("/tree?person=p1&story=s1");
    expect(treeStoryHref("p 1", "s&1")).toBe("/tree?person=p%201&story=s%261");
  });

  it("finds a story's tree from its public page, behind sign-in", () => {
    expect(storyHref("s1")).toBe("/stories/s1");
    expect(storyHref("a/b")).toBe("/stories/a%2Fb");
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

describe("welcomeHref", () => {
  it("asks a newcomer for their details, and only greets a returning member", () => {
    expect(welcomeHref()).toBe("/welcome");
    expect(welcomeHref({ returning: true })).toBe("/welcome?returning=1");
  });
});

describe("joinedTreeHref", () => {
  it("opens the canvas on their own entry after an ordinary invite", () => {
    expect(joinedTreeHref({ selfPersonId: "p1", selfPlaced: true })).toBe(
      "/tree?person=p1",
    );
  });

  it("welcomes someone whose claim invite has just made its entry theirs", () => {
    expect(
      joinedTreeHref({
        selfPersonId: "p1",
        selfPlaced: true,
        claimInvite: true,
        hadEntry: false,
        wasMember: false,
      }),
    ).toBe("/welcome");
    // On the tree already, but with no entry until now: theirs is new too.
    expect(
      joinedTreeHref({
        selfPersonId: "p1",
        selfPlaced: true,
        claimInvite: true,
        hadEntry: false,
        wasMember: true,
      }),
    ).toBe("/welcome");
  });

  it("greets a member who brings their own entry to a claim invite's tree", () => {
    expect(
      joinedTreeHref({
        selfPersonId: "own",
        selfPlaced: true,
        claimInvite: true,
        hadEntry: true,
        wasMember: false,
      }),
    ).toBe("/welcome?returning=1");
  });

  it("skips the welcome on a tree they were on already", () => {
    expect(
      joinedTreeHref({
        selfPersonId: "own",
        selfPlaced: true,
        claimInvite: true,
        hadEntry: true,
        wasMember: true,
      }),
    ).toBe("/tree?person=own");
  });

  it("skips the welcome for an ordinary invite, entry or not", () => {
    expect(
      joinedTreeHref({
        selfPersonId: "own",
        selfPlaced: true,
        claimInvite: false,
        hadEntry: true,
        wasMember: false,
      }),
    ).toBe("/tree?person=own");
  });

  it("sends a claim invite whose claim didn't happen to onboarding", () => {
    // The entry went to someone else, or left the tree, meanwhile.
    expect(
      joinedTreeHref({
        selfPersonId: null,
        selfPlaced: false,
        claimInvite: true,
        hadEntry: false,
        wasMember: false,
      }),
    ).toBe("/onboarding");
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
