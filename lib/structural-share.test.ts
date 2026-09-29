import { describe, expect, it } from "vitest";

import { shallowEqual, shareEqual } from "@/lib/structural-share";

const row = (id: string, name: string) => ({
  id,
  name,
  tags: ["a", "b"],
  joined_by: { name: "Root" },
});

describe("keeping what didn't change (Step 87.1)", () => {
  it("gives back the old value when the new one is equal throughout", () => {
    const prev = { people: [row("1", "Amina"), row("2", "Salim")], note: null };
    const next = { people: [row("1", "Amina"), row("2", "Salim")], note: null };
    expect(shareEqual(prev, next)).toBe(prev);
  });

  it("keeps each unchanged row and makes new only what changed", () => {
    const prev = [row("1", "Amina"), row("2", "Salim"), row("3", "Zara")];
    const next = [row("1", "Amina"), row("2", "Salim K"), row("3", "Zara")];
    const out = shareEqual(prev, next);
    expect(out).not.toBe(prev);
    expect(out).toEqual(next);
    expect(out[0]).toBe(prev[0]);
    expect(out[1]).not.toBe(prev[1]);
    expect(out[1].tags).toBe(prev[1].tags);
    expect(out[1].joined_by).toBe(prev[1].joined_by);
    expect(out[2]).toBe(prev[2]);
  });

  it("matches rows by id, so one added doesn't make the rest look new", () => {
    const prev = [row("1", "Amina"), row("3", "Zara")];
    const next = [row("1", "Amina"), row("2", "New"), row("3", "Zara")];
    const out = shareEqual(prev, next);
    expect(out).toEqual(next);
    expect(out[0]).toBe(prev[0]);
    expect(out[2]).toBe(prev[1]);
  });

  it("gives a new list when rows are only reordered or taken out", () => {
    const prev = [row("1", "Amina"), row("2", "Salim")];
    const swapped = shareEqual(prev, [row("2", "Salim"), row("1", "Amina")]);
    expect(swapped).not.toBe(prev);
    expect(swapped[0]).toBe(prev[1]);
    const fewer = shareEqual(prev, [row("1", "Amina")]);
    expect(fewer).toEqual([prev[0]]);
    expect(fewer[0]).toBe(prev[0]);
  });

  it("matches lists without ids by place", () => {
    const prev = ["x", "y"];
    expect(shareEqual(prev, ["x", "y"])).toBe(prev);
    expect(shareEqual(prev, ["x", "z"])).toEqual(["x", "z"]);
  });

  it("sees a key added, taken out or turned undefined", () => {
    const prev: Record<string, unknown> = { a: 1 };
    expect(shareEqual(prev, { a: 1, b: undefined })).not.toBe(prev);
    expect(shareEqual({ a: 1, b: 2 }, { a: 1 })).toEqual({ a: 1 });
  });

  it("compares anything but plain objects and arrays by identity", () => {
    const prev = { when: new Date(0), set: new Set([1]) };
    const next = { when: new Date(0), set: new Set([1]) };
    const out = shareEqual(prev, next);
    expect(out.when).toBe(next.when);
    expect(out.set).toBe(next.set);
    expect(shareEqual(NaN, NaN)).toBeNaN();
  });

  it("compares two objects one level deep", () => {
    const person = { id: "1" };
    expect(shallowEqual({ person, dimmed: false }, { person, dimmed: false })).toBe(true);
    expect(shallowEqual({ person, dimmed: false }, { person, dimmed: true })).toBe(false);
    expect(shallowEqual({ person }, { person: { id: "1" } })).toBe(false);
    expect(shallowEqual({ a: undefined }, { b: undefined })).toBe(false);
  });
});
