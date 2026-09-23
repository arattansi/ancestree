import { describe, expect, it } from "vitest";

import { requestRows } from "@/lib/request-rows";

const amina = { id: "r1", createdAt: "2026-09-20T10:00:00+00:00" };
const karim = { id: "r2", createdAt: "2026-09-21T10:00:00+00:00" };
const zara = { id: "r3", createdAt: "2026-09-22T10:00:00+00:00" };

describe("requestRows (Step 30.3)", () => {
  it("keeps an approved request in its place once the refresh drops it", () => {
    // Karim was approved: the server lists only Amina and Zara now.
    expect(requestRows([amina, zara], [karim])).toEqual([amina, karim, zara]);
  });

  it("shows a request once while the server still lists it as pending", () => {
    expect(requestRows([amina, karim, zara], [karim])).toEqual([amina, karim, zara]);
  });

  it("lists oldest first, ties by id", () => {
    const sameTime = { id: "r0", createdAt: karim.createdAt };
    expect(requestRows([zara, karim, sameTime, amina], [])).toEqual([
      amina,
      sameTime,
      karim,
      zara,
    ]);
  });

  it("is empty with nothing pending and nothing kept", () => {
    expect(requestRows([], [])).toEqual([]);
  });
});
