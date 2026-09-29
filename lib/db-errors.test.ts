import { describe, expect, it } from "vitest";

import {
  friendlyDbError,
  ownedWrite,
  RLS_REFUSED,
  SOMETHING_WENT_WRONG,
  type ErrorRule,
} from "@/lib/db-errors";

describe("friendlyDbError (Step 77.4)", () => {
  const rules: ErrorRule[] = [
    ["Parent/child loop", "That would make a loop."],
    [(m) => m.startsWith("OWN_LINE"), "Only on your own line."],
    [RLS_REFUSED, "Not yours to change."],
  ];

  it("says the first rule the refusal matches, in any case", () => {
    expect(friendlyDbError("would create a parent/child LOOP", rules, "No.")).toBe(
      "That would make a loop.",
    );
    expect(
      friendlyDbError(
        'new row violates row-level security policy for table "people"',
        rules,
        "No.",
      ),
    ).toBe("Not yours to change.");
  });

  it("hands a test the message as it came", () => {
    expect(friendlyDbError("OWN_LINE: a Leaf adds…", rules, "No.")).toBe(
      "Only on your own line.",
    );
    expect(friendlyDbError("own_line", rules, "No.")).toBe("No.");
  });

  it("falls back, and says something went wrong for no message", () => {
    expect(friendlyDbError("deadlock detected", rules, "No.")).toBe("No.");
    expect(friendlyDbError("", rules, "No.")).toBe(SOMETHING_WENT_WRONG);
    expect(friendlyDbError(null, rules, "No.")).toBe(SOMETHING_WENT_WRONG);
  });
});

describe("ownedWrite (Step 77.4)", () => {
  const say = { refused: "Not yours.", failed: "Couldn't save." };

  it("gives back the rows it wrote", async () => {
    await expect(
      ownedWrite(Promise.resolve({ data: [{ id: "a" }], error: null }), say),
    ).resolves.toEqual({ rows: [{ id: "a" }] });
  });

  it("reads no rows back as a refusal, never as success", async () => {
    await expect(
      ownedWrite(Promise.resolve({ data: [], error: null }), say),
    ).resolves.toEqual({ error: "Not yours." });
    await expect(
      ownedWrite(Promise.resolve({ data: null, error: null }), say),
    ).resolves.toEqual({ error: "Not yours." });
  });

  it("says what an error means", async () => {
    const failed = { data: null, error: { message: "violates check" } };
    await expect(ownedWrite(Promise.resolve(failed), say)).resolves.toEqual({
      error: "Couldn't save.",
    });
    await expect(
      ownedWrite(Promise.resolve(failed), {
        refused: "Not yours.",
        failed: (m) => `No: ${m}`,
      }),
    ).resolves.toEqual({ error: "No: violates check" });
  });
});
