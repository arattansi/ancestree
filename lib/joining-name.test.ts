import { describe, expect, it } from "vitest";

import {
  joiningDisplayName,
  readJoiningName,
  signInAsksName,
} from "@/lib/joining-name";
import { MAX_NAME_LENGTH } from "@/lib/request-forms";

describe("signInAsksName", () => {
  it("asks someone joining by an invite link, not someone signing back in", () => {
    expect(signInAsksName("tok")).toBe(true);
    expect(signInAsksName(undefined)).toBe(false);
    expect(signInAsksName(null)).toBe(false);
    expect(signInAsksName("  ")).toBe(false);
  });
});

describe("readJoiningName", () => {
  it("reads both halves back off an account's metadata", () => {
    expect(
      readJoiningName({ first_name: "Mary Ann", last_name: "de la Cruz", email_verified: true }),
    ).toEqual({ first_name: "Mary Ann", last_name: "de la Cruz" });
  });

  it("reads a request row the same way, its columns being named alike", () => {
    expect(
      readJoiningName({ first_name: " Zahra ", last_name: "Suleman", email: "z@example.com" }),
    ).toEqual({ first_name: "Zahra", last_name: "Suleman" });
  });

  it("tidies the spacing as the search does", () => {
    expect(readJoiningName({ first_name: " Mary   Ann ", last_name: "Smith" })).toEqual({
      first_name: "Mary Ann",
      last_name: "Smith",
    });
  });

  it("holds no name without both halves", () => {
    expect(readJoiningName({ first_name: "Zahra", last_name: "  " })).toBeNull();
    expect(readJoiningName({ first_name: "Zahra" })).toBeNull();
    expect(readJoiningName({})).toBeNull();
    expect(readJoiningName(null)).toBeNull();
    expect(readJoiningName(undefined)).toBeNull();
  });

  it("ignores what the forms would never have taken", () => {
    expect(readJoiningName({ first_name: 7, last_name: "Suleman" })).toBeNull();
    expect(readJoiningName("Zahra Suleman")).toBeNull();
    expect(
      readJoiningName({ first_name: "Z".repeat(MAX_NAME_LENGTH + 1), last_name: "Suleman" }),
    ).toBeNull();
  });
});

describe("joiningDisplayName", () => {
  it("names a new profile first name first", () => {
    expect(joiningDisplayName({ first_name: "Mary Ann", last_name: "Smith" })).toBe(
      "Mary Ann Smith",
    );
  });

  it("leaves it to the address when there's no name", () => {
    expect(joiningDisplayName(null)).toBeUndefined();
  });
});
