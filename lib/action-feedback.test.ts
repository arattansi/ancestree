import { describe, expect, it } from "vitest";

import { actionError, isRedirect } from "./action-feedback";

describe("isRedirect", () => {
  it("knows a server action's redirect", () => {
    expect(
      isRedirect(
        Object.assign(new Error("NEXT_REDIRECT"), {
          digest: "NEXT_REDIRECT;replace;/trees;307;",
        }),
      ),
    ).toBe(true);
    expect(isRedirect({ digest: "NEXT_REDIRECT;push;/tree?person=a;b;303;" })).toBe(
      true,
    );
  });

  it("isn't fooled by other failures", () => {
    expect(isRedirect(new TypeError("Failed to fetch"))).toBe(false);
    expect(isRedirect({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" })).toBe(false);
    expect(isRedirect({ digest: "NEXT_REDIRECT;sideways;/x;307;" })).toBe(false);
    expect(isRedirect({ digest: 42 })).toBe(false);
    expect(isRedirect(null)).toBe(false);
    expect(isRedirect("NEXT_REDIRECT")).toBe(false);
  });
});

describe("actionError", () => {
  it("reads an action's refusal", () => {
    expect(actionError({ error: "You can't edit this entry." })).toBe(
      "You can't edit this entry.",
    );
  });

  it("treats every other answer as success", () => {
    expect(actionError(undefined)).toBeNull();
    expect(actionError(null)).toBeNull();
    expect(actionError({})).toBeNull();
    expect(actionError({ ok: true })).toBeNull();
    expect(actionError({ petId: "p1" })).toBeNull();
    expect(actionError("done")).toBeNull();
  });

  it("ignores an empty or non-text error", () => {
    expect(actionError({ error: "" })).toBeNull();
    expect(actionError({ error: "  " })).toBeNull();
    expect(actionError({ error: undefined })).toBeNull();
    expect(actionError({ error: null })).toBeNull();
    expect(actionError({ error: 404 })).toBeNull();
  });
});
