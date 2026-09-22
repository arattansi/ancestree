import { describe, expect, it } from "vitest";

import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  nameAndEmailProblem,
  problemState,
  readNameAndEmail,
} from "@/lib/request-forms";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("readNameAndEmail", () => {
  it("trims the names and trims and lower-cases the address", () => {
    const { entered, problem } = readNameAndEmail(
      form({ firstName: "  Zahra ", lastName: " Suleman", email: " Zahra@Example.COM " }),
    );
    expect(entered).toEqual({
      firstName: "Zahra",
      lastName: "Suleman",
      email: "zahra@example.com",
    });
    expect(problem).toBeNull();
  });

  it("hands the entry back beside the problem, so the form can show it again", () => {
    const { entered, problem } = readNameAndEmail(
      form({ firstName: "Zahra", lastName: "", email: "zahra@example.com" }),
    );
    expect(problem).toEqual({ field: "name", message: "Enter your first and last name." });
    expect(entered.firstName).toBe("Zahra");
    expect(entered.email).toBe("zahra@example.com");
  });

  it("treats missing fields as empty", () => {
    const { entered, problem } = readNameAndEmail(new FormData());
    expect(entered).toEqual({ firstName: "", lastName: "", email: "" });
    expect(problem?.field).toBe("name");
  });
});

describe("nameAndEmailProblem", () => {
  const ok = { firstName: "Zahra", lastName: "Suleman", email: "zahra@example.com" };

  it("accepts a first name, a last name and an address", () => {
    expect(nameAndEmailProblem(ok)).toBeNull();
  });

  it("needs both names, and says it's the name at fault", () => {
    for (const entry of [{ ...ok, firstName: "" }, { ...ok, lastName: "" }]) {
      expect(nameAndEmailProblem(entry)).toEqual({
        field: "name",
        message: "Enter your first and last name.",
      });
    }
  });

  it("refuses a name longer than the database keeps", () => {
    expect(
      nameAndEmailProblem({ ...ok, lastName: "x".repeat(MAX_NAME_LENGTH + 1) }),
    ).toEqual({ field: "name", message: "That name is too long." });
    expect(
      nameAndEmailProblem({ ...ok, lastName: "x".repeat(MAX_NAME_LENGTH) }),
    ).toBeNull();
  });

  it("refuses something that isn't an address, and says it's the address", () => {
    for (const email of ["", "zahra", "zahra@", "zahra@example", "za hra@example.com"]) {
      expect(nameAndEmailProblem({ ...ok, email })).toEqual({
        field: "email",
        message: "Enter a valid email address.",
      });
    }
  });

  it("refuses an address too long to be real", () => {
    const local = "x".repeat(MAX_EMAIL_LENGTH);
    expect(nameAndEmailProblem({ ...ok, email: `${local}@example.com` })?.field).toBe(
      "email",
    );
  });
});

describe("problemState", () => {
  it("carries the message, the field and the entry together", () => {
    const entered = { firstName: "Zahra", lastName: "Suleman", email: "zahra" };
    expect(
      problemState({ field: "email", message: "Enter a valid email address." }, entered),
    ).toEqual({
      error: "Enter a valid email address.",
      errorField: "email",
      ...entered,
    });
  });
});
