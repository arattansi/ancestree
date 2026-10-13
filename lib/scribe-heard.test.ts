import { describe, expect, it } from "vitest";

import { hear, heardText, NOTHING_HEARD, settle, type Heard } from "@/lib/scribe-heard";

const run = (events: [string, boolean][], from: Heard = NOTHING_HEARD) =>
  events.reduce((heard, [t, final]) => hear(heard, t, final), from);

describe("hear", () => {
  it("follows an iPhone revising one transcript, then its final", () => {
    const heard = run([
      ["we came", false],
      ["we came by boat", false],
      ["We came by boat to Mombasa", false],
      ["We came by boat to Mombasa in 1952.", true],
    ]);
    expect(heard).toEqual({ kept: ["We came by boat to Mombasa in 1952."], live: "" });
  });

  it("keeps what an iPhone dropped when it started over after a pause", () => {
    const heard = run([
      ["We came by boat to Mombasa in 1952", false],
      ["my father", false],
      ["my father opened a shop", false],
    ]);
    expect(heardText(heard)).toBe("We came by boat to Mombasa in 1952 my father opened a shop");
  });

  it("doesn't mistake a revision for starting over", () => {
    const heard = run([
      ["We came by boat to Mombasa in 1952 and", false],
      ["We came by boat to Mombasa in 1952", false],
    ]);
    expect(heard).toEqual({ kept: [], live: "We came by boat to Mombasa in 1952" });
  });

  it("follows Android's segments, each with its final", () => {
    const heard = run([
      ["we came", false],
      ["we came by boat", true],
      ["to Mombasa", false],
      ["to Mombasa in 1952", true],
    ]);
    expect(heardText(heard)).toBe("we came by boat to Mombasa in 1952");
  });
});

describe("settle", () => {
  it("keeps what was live when a session ends, so the next carries on", () => {
    const paused = settle(run([["We came by boat", false]]));
    expect(paused).toEqual({ kept: ["We came by boat"], live: "" });
    expect(heardText(run([["to Mombasa", false]], paused))).toBe("We came by boat to Mombasa");
  });

  it("leaves nothing live as it was", () => {
    expect(settle(NOTHING_HEARD)).toBe(NOTHING_HEARD);
  });
});
