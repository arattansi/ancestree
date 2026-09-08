import { describe, expect, it } from "vitest";

import { nodeDisplayName, personDisplayName } from "@/lib/person-name";

describe("nodeDisplayName", () => {
  it("leaves a name that fits alone", () => {
    const p = { first_name: "Zahir", last_name: "Kanji" };
    expect(nodeDisplayName(p)).toBe(personDisplayName(p));
  });

  it("condenses the surname to an initial when the name is too long", () => {
    expect(
      nodeDisplayName({ first_name: "Shahsultan", last_name: "Rattansi" }),
    ).toBe("Shahsultan R.");
  });

  it("uses the preferred name it would have shown anyway", () => {
    expect(
      nodeDisplayName({
        first_name: "Muhammad",
        preferred_name: "Mo",
        last_name: "Nurmohamed",
      }),
    ).toBe("Mo Nurmohamed");
  });

  it("leaves a long single name to the card to truncate", () => {
    expect(nodeDisplayName({ first_name: "Bartholomewicious" })).toBe(
      "Bartholomewicious",
    );
  });
});
