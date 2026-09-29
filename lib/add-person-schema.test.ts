import { describe, expect, it } from "vitest";

import { flowSchema, inviteAddress, type FlowValues } from "@/lib/add-person-schema";
import { emptyPersonValues } from "@/lib/person-schema";

const person = { ...emptyPersonValues, first_name: "Zahra", last_name: "Suleman" };

/** A child of the anchor, with nothing else asked for. */
function values(patch: Partial<FlowValues> = {}): FlowValues {
  return {
    people: [person],
    anchorId: "anchor",
    links: [{ kind: "child" }],
    extraLinks: [],
    inviteEmail: "",
    ...patch,
  };
}

/** Where the schema puts each of its complaints. */
function problems(input: FlowValues): string[] {
  const parsed = flowSchema.safeParse(input);
  return parsed.success ? [] : parsed.error.issues.map((i) => i.path.join("."));
}

describe("inviteAddress", () => {
  it("is the address, trimmed", () => {
    expect(inviteAddress({ people: [person], inviteEmail: "  z@example.com " })).toBe(
      "z@example.com",
    );
  });

  it("is nobody's for someone who has died", () => {
    expect(
      inviteAddress({
        people: [{ ...person, is_deceased: true }],
        inviteEmail: "z@example.com",
      }),
    ).toBe("");
  });
});

describe("flowSchema", () => {
  it("takes a plain add", () => {
    expect(problems(values())).toEqual([]);
  });

  it("refuses an address that isn't one, while they're living", () => {
    expect(problems(values({ inviteEmail: "not an address" }))).toEqual(["inviteEmail"]);
    expect(
      problems(
        values({
          people: [{ ...person, is_deceased: true }],
          inviteEmail: "not an address",
        }),
      ),
    ).toEqual([]);
  });

  it("refuses the same connection twice", () => {
    expect(
      problems(
        values({
          extraLinks: [
            { targetId: "aunt", kind: "child" },
            { targetId: "aunt", kind: "child" },
          ],
        }),
      ),
    ).toEqual(["extraLinks.1.targetId"]);
  });

  it("checks marriage dates only on a spouse link", () => {
    const divorcedFirst = {
      marriage_date: "2000-01-01",
      is_divorced: true,
      divorce_date: "1990-01-01",
    };
    expect(problems(values({ links: [{ kind: "spouse", ...divorcedFirst }] }))).toEqual([
      "links.0.divorce_date",
    ]);
    // Switched to "child", the old dates no longer hold it up.
    expect(problems(values({ links: [{ kind: "child", ...divorcedFirst }] }))).toEqual([]);
  });
});
