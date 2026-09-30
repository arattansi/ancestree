import { describe, expect, it } from "vitest";

import {
  personSheetHref,
  sheetPersonParam,
  sheetSectionsParam,
} from "@/lib/person-sheet";

const ID = "3eae5c10-937e-811a-bab6-e5dfddbd2096";

describe("person sheet params (Step 87.6)", () => {
  it("takes an entry id and nothing else", () => {
    expect(sheetPersonParam(ID)).toBe(ID);
    expect(sheetPersonParam(null)).toBeNull();
    expect(sheetPersonParam("")).toBeNull();
    expect(sheetPersonParam(`${ID},x`)).toBeNull();
    expect(sheetPersonParam("not-an-id")).toBeNull();
  });

  it("reads the sections asked for, once each, in a fixed order", () => {
    expect(sheetSectionsParam("stories,trees")).toEqual(["trees", "stories"]);
    expect(sheetSectionsParam("reports,reports")).toEqual(["reports"]);
    expect(sheetSectionsParam("stories,album,reports,trees")).toEqual([
      "trees",
      "reports",
      "album",
      "stories",
    ]);
  });

  it("refuses no sections, or one it doesn't know", () => {
    expect(sheetSectionsParam(null)).toBeNull();
    expect(sheetSectionsParam("")).toBeNull();
    expect(sheetSectionsParam("trees,documents")).toBeNull();
    expect(sheetSectionsParam("trees,")).toBeNull();
  });

  it("asks for what it's given", () => {
    const href = personSheetHref(ID, ["trees", "stories"]);
    const url = new URL(href, "http://x");
    expect(url.pathname).toBe("/api/person-sheet");
    expect(sheetPersonParam(url.searchParams.get("person"))).toBe(ID);
    expect(sheetSectionsParam(url.searchParams.get("want"))).toEqual([
      "trees",
      "stories",
    ]);
  });
});
