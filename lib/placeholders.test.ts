import { describe, expect, it } from "vitest";

import type { ConnectionEdge } from "@/lib/connections";
import { personDisplayName, personInitials } from "@/lib/person-name";
import { placeholderLabel, placeholderParents } from "@/lib/placeholders";

describe("placeholderLabel", () => {
  it("says the number in words up to twelve, as private.placeholder_label", () => {
    expect(placeholderLabel(1)).toBe("First Child");
    expect(placeholderLabel(2)).toBe("Second Child");
    expect(placeholderLabel(12)).toBe("Twelfth Child");
    expect(placeholderLabel(13)).toBe("13th Child");
    expect(placeholderLabel(21)).toBe("21st Child");
    expect(placeholderLabel(22)).toBe("22nd Child");
    expect(placeholderLabel(103)).toBe("103rd Child");
    expect(placeholderLabel(111)).toBe("111th Child");
  });

  it("names a placeholder everywhere a name is shown", () => {
    const p = {
      first_name: null,
      preferred_name: null,
      last_name: "",
      placeholder_number: 3,
    };
    expect(personDisplayName(p)).toBe("Third Child");
    expect(personInitials(p)).toBe("?");
    expect(personDisplayName({ ...p, placeholder_number: null })).toBe(
      "Unnamed person",
    );
  });
});

describe("placeholderParents", () => {
  const existing = (id: string) => ({ kind: "existing" as const, id });
  const fresh = (index: number) => ({ kind: "new" as const, index });
  const parentsOf = (id: string) =>
    id === "sib" ? ["mum", "dad"] : id === "only" ? ["gran"] : [];

  it("holds a child's place under the parents the save draws", () => {
    const edges: ConnectionEdge[] = [
      { type: "parent", a: existing("mum"), b: fresh(0) },
      { type: "parent", a: existing("dad"), b: fresh(0) },
    ];
    expect(placeholderParents({ index: 0, edges, parentsOf })).toEqual([
      "mum",
      "dad",
    ]);
  });

  it("takes a sibling's parents when only the sibling is drawn", () => {
    const edges: ConnectionEdge[] = [
      { type: "sibling", a: existing("sib"), b: fresh(0) },
    ];
    expect(placeholderParents({ index: 0, edges, parentsOf })).toEqual([
      "mum",
      "dad",
    ]);
  });

  it("has nobody when their parent is new too, or the sibling has none", () => {
    expect(
      placeholderParents({
        index: 0,
        edges: [
          { type: "parent", a: existing("gran"), b: fresh(1) },
          { type: "parent", a: fresh(1), b: fresh(0) },
        ],
        parentsOf,
      }),
    ).toEqual([]);
    expect(
      placeholderParents({
        index: 0,
        edges: [{ type: "sibling", a: fresh(0), b: existing("nobody") }],
        parentsOf,
      }),
    ).toEqual([]);
    // A partner isn't a parent.
    expect(
      placeholderParents({
        index: 0,
        edges: [{ type: "spouse", a: existing("mum"), b: fresh(0) }],
        parentsOf,
      }),
    ).toEqual([]);
  });
});
