import { describe, expect, it } from "vitest";

import type { ConnectionRelationship } from "@/lib/connection-path";
import { closestFirst, memberRelation, type RelationPerson } from "@/lib/messenger-relation";

// Amira's mother Leila; Leila's sister Nadia (a stored sibling row); Nadia's
// son Bilal and husband Karim; Karim's brother Cyrus; Amira's sister Dina.
const people = new Map<string, RelationPerson>([
  ["amira", { name: "Amira", sex: "female" }],
  ["dina", { name: "Dina", sex: "female" }],
  ["leila", { name: "Leila", sex: "female" }],
  ["nadia", { name: "Nadia", sex: "female" }],
  ["bilal", { name: "Bilal", sex: "male" }],
  ["karim", { name: "Karim", sex: "male" }],
  ["cyrus", { name: "Cyrus", sex: null }],
  ["zara", { name: "Zara", sex: "female" }],
]);
const line = (
  from_person: string,
  type: string,
  to_person: string,
  is_divorced = false,
): ConnectionRelationship => ({ from_person, to_person, type, is_divorced });
const lines = [
  line("leila", "parent", "amira"),
  line("leila", "parent", "dina"),
  line("leila", "sibling", "nadia"),
  line("nadia", "parent", "bilal"),
  line("nadia", "spouse", "karim"),
  line("karim", "sibling", "cyrus"),
];

describe("memberRelation (Step 177.1)", () => {
  it("names a cousin, with the chain between you", () => {
    expect(memberRelation("amira", "bilal", people, lines)).toEqual({
      label: "Your first cousin",
      distance: 4,
      chain: [
        { personId: "amira", says: "You" },
        { personId: "leila", says: "your mother Leila" },
        { personId: "nadia", says: "her sister Nadia" },
        { personId: "bilal", says: "her son Bilal" },
      ],
    });
  });

  it("names a sister through the parent you share", () => {
    const sister = memberRelation("amira", "dina", people, lines);
    expect(sister?.label).toBe("Your sister");
    expect(sister?.distance).toBe(2);
    expect(sister?.chain.map((l) => l.says)).toEqual([
      "You",
      "your mother Leila",
      "her daughter Dina",
    ]);
  });

  it("counts the people between where no everyday word fits", () => {
    const far = memberRelation("amira", "cyrus", people, lines);
    expect(far?.label).toBe("Connected through 3 people");
    expect(far?.chain.map((l) => l.says)).toEqual([
      "You",
      "your mother Leila",
      "her sister Nadia",
      "her husband Karim",
      "his sibling Cyrus",
    ]);
  });

  it("says an ended marriage is a former one", () => {
    const rel = memberRelation("nadia", "karim", people, [line("nadia", "spouse", "karim", true)]);
    expect(rel?.label).toBe("Your former husband");
    expect(rel?.chain.at(-1)?.says).toBe("your former husband Karim");
  });

  it("is nothing when no line you can see joins you, or either isn't there", () => {
    expect(memberRelation("amira", "zara", people, lines)).toBeNull();
    expect(memberRelation("amira", "nobody", people, lines)).toBeNull();
    expect(memberRelation("amira", "amira", people, lines)).toBeNull();
  });

  it("lists the closest first, then everyone else by name", () => {
    const contacts = [{ name: "Zara" }, { name: "Cyrus" }, { name: "Bilal" }, { name: "Dina" }, { name: "Adam" }];
    const distance: Record<string, number> = { Cyrus: 6, Bilal: 4, Dina: 2 };
    expect(closestFirst(contacts, (c) => distance[c.name] ?? null).map((c) => c.name)).toEqual([
      "Dina",
      "Bilal",
      "Cyrus",
      "Adam",
      "Zara",
    ]);
  });
});
