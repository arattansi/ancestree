import { describe, expect, it } from "vitest";

import {
  LIBRARY_CHANGE_MAX,
  LIBRARY_SUBMISSION_BODY_MAX,
} from "@/lib/limits";
import {
  hasChangeWaiting,
  peopleNames,
  readChangeMessage,
  readChangeRequests,
  readSubmissionFields,
  readSubmissionStatus,
  submissionRefusal,
} from "@/lib/library-submissions";

const ok = {
  email: "  Leah@Example.com ",
  title: "  A   garden  ",
  body: "\n She grew figs. \n",
  kind: "couple",
  people: [{ first: " Amina ", last: "Khan" }, { first: "", last: "" }, { first: "Yusuf" }],
  agreed: true,
};

describe("readSubmissionFields (Step 157)", () => {
  it("trims what was typed and keeps who was named", () => {
    const fields = readSubmissionFields(ok);
    expect(fields).toEqual({
      ok: true,
      email: "leah@example.com",
      title: "A garden",
      body: "She grew figs.",
      kind: "couple",
      people: [
        { first: "Amina", last: "Khan", maiden: "", place: "" },
        { first: "Yusuf", last: "", maiden: "", place: "" },
      ],
    });
  });

  it("takes the form's tick as agreeing", () => {
    expect(readSubmissionFields({ ...ok, agreed: "1" }).ok).toBe(true);
    expect(readSubmissionFields({ ...ok, agreed: "on" }).ok).toBe(true);
  });

  it("refuses what's missing, one thing at a time", () => {
    expect(readSubmissionFields({ ...ok, people: [{ first: " " }] })).toEqual({
      ok: false,
      error: "Give their name.",
    });
    expect(readSubmissionFields({ ...ok, title: " " })).toEqual({
      ok: false,
      error: "Give it a title.",
    });
    expect(readSubmissionFields({ ...ok, body: "  " })).toEqual({
      ok: false,
      error: "Write their story.",
    });
    expect(readSubmissionFields({ ...ok, email: "leah" })).toEqual({
      ok: false,
      error: "Enter your email address.",
    });
    expect(readSubmissionFields({ ...ok, agreed: false })).toEqual({
      ok: false,
      error: "Agree to it being edited to send it.",
    });
    expect(readSubmissionFields({ ...ok, agreed: "0" }).ok).toBe(false);
  });

  it("says how far over a long story is", () => {
    const fields = readSubmissionFields({
      ...ok,
      body: "a".repeat(LIBRARY_SUBMISSION_BODY_MAX + 1200),
    });
    expect(fields).toEqual({ ok: false, error: "Too long by 1,200 characters." });
  });

  it("takes an unknown kind as one person", () => {
    const fields = readSubmissionFields({ ...ok, kind: "tribe" });
    expect(fields.ok && fields.kind).toBe("person");
  });
});

describe("readChangeMessage", () => {
  it("trims it", () => {
    expect(readChangeMessage("  Her name is Aminah. ")).toEqual({
      ok: true,
      message: "Her name is Aminah.",
    });
  });

  it("refuses an empty one and a long one", () => {
    expect(readChangeMessage(" ")).toEqual({ ok: false, error: "Say what should change." });
    expect(readChangeMessage("a".repeat(LIBRARY_CHANGE_MAX + 1))).toEqual({
      ok: false,
      error: "Keep it under 2,000 characters.",
    });
  });
});

describe("reading what the database hands back", () => {
  it("keeps only changes asked for that are whole", () => {
    expect(
      readChangeRequests([
        { id: "1", message: "a", resolvedAt: null, createdAt: "2026-10-15T00:00:00Z" },
        { id: "2", message: "b", resolvedAt: "2026-10-16T00:00:00Z", createdAt: "2026-10-15T01:00:00Z" },
        { id: 3, message: "c", createdAt: "x" },
        null,
      ]),
    ).toEqual([
      { id: "1", message: "a", resolvedAt: null, createdAt: "2026-10-15T00:00:00Z" },
      { id: "2", message: "b", resolvedAt: "2026-10-16T00:00:00Z", createdAt: "2026-10-15T01:00:00Z" },
    ]);
    expect(readChangeRequests("nope")).toEqual([]);
  });

  it("says when a change is still waiting", () => {
    const done = { id: "1", message: "a", resolvedAt: "x", createdAt: "x" };
    expect(hasChangeWaiting([done])).toBe(false);
    expect(hasChangeWaiting([done, { ...done, id: "2", resolvedAt: null }])).toBe(true);
  });

  it("reads a status, new for anything else", () => {
    expect(readSubmissionStatus("drafted")).toBe("drafted");
    expect(readSubmissionStatus("published")).toBe("new");
  });
});

describe("peopleNames", () => {
  const p = (first: string, last = "") => ({ first, last, maiden: "", place: "" });
  it("names one, two, or a list", () => {
    expect(peopleNames([])).toBe("");
    expect(peopleNames([p("Amina", "Khan")])).toBe("Amina Khan");
    expect(peopleNames([p("Amina", "Khan"), p("Yusuf", "Khan")])).toBe("Amina Khan and Yusuf Khan");
    expect(peopleNames([p("A"), p("B"), p("C")])).toBe("A, B and C");
  });
});

describe("submissionRefusal", () => {
  it("says each cap in words, and nothing for anything else", () => {
    expect(submissionRefusal("TOO_MANY_FROM_ADDRESS")).toMatch(/three stories/);
    expect(submissionRefusal("TOO_MANY_TODAY")).toMatch(/Too many stories/);
    expect(submissionRefusal("TOO_MANY_CHANGES")).toMatch(/Ten changes/);
    expect(submissionRefusal("NO_SUBMISSION")).toBe("This link doesn’t work.");
    expect(submissionRefusal("boom")).toBeNull();
    expect(submissionRefusal(undefined)).toBeNull();
  });
});
