import { describe, expect, it } from "vitest";

import { DEFAULT_NEXT, safeNext, sameOriginPath, signInNext } from "@/lib/safe-next";

describe("sameOriginPath", () => {
  it("keeps a path on this site, query and fragment included", () => {
    expect(sameOriginPath("/tree")).toBe("/tree");
    expect(
      sameOriginPath(
        "/account/admin?tree=6f1c2b3a-0000-4000-8000-000000000001&section=invite-requests",
      ),
    ).toBe(
      "/account/admin?tree=6f1c2b3a-0000-4000-8000-000000000001&section=invite-requests",
    );
    expect(sameOriginPath("/account?view=admin#invite-requests")).toBe(
      "/account?view=admin#invite-requests",
    );
  });

  it("refuses anything that could leave the site", () => {
    for (const raw of [
      "//evil.example",
      "//evil.example/tree",
      "/\\evil.example",
      "\\\\evil.example",
      "https://evil.example",
      "http:/evil.example",
      "javascript:alert(1)",
      "evil.example",
      "tree",
    ]) {
      expect(sameOriginPath(raw), raw).toBeNull();
    }
  });

  it("refuses tabs, newlines and spaces, which parsers drop or mangle", () => {
    for (const raw of ["/\t/evil.example", "/\n/evil.example", "/tree\r\n", "/ /x", "/\u007f"]) {
      expect(sameOriginPath(raw), JSON.stringify(raw)).toBeNull();
    }
  });

  it("refuses nothing, non-strings and the absurdly long", () => {
    expect(sameOriginPath("")).toBeNull();
    expect(sameOriginPath(null)).toBeNull();
    expect(sameOriginPath(undefined)).toBeNull();
    expect(sameOriginPath(`/${"a".repeat(3000)}`)).toBeNull();
  });

  it("leaves an encoded slash as part of the path, where it's harmless", () => {
    expect(sameOriginPath("/%2F%2Fevil.example")).toBe("/%2F%2Fevil.example");
  });

  it("tidies dot segments without leaving the site", () => {
    expect(sameOriginPath("/people/../account")).toBe("/account");
    expect(sameOriginPath("/../../tree")).toBe("/tree");
  });
});

describe("safeNext", () => {
  it("falls back to the canvas", () => {
    expect(safeNext("//evil.example")).toBe(DEFAULT_NEXT);
    expect(safeNext(null)).toBe("/tree");
    expect(safeNext("/trees/new")).toBe("/trees/new");
  });
});

describe("signInNext", () => {
  it("carries a members' page, query included", () => {
    expect(
      signInNext(
        "/account/admin",
        "?tree=6f1c2b3a-0000-4000-8000-000000000001&section=invite-requests",
      ),
    ).toBe(
      "/account/admin?tree=6f1c2b3a-0000-4000-8000-000000000001&section=invite-requests",
    );
    expect(signInNext("/account", "")).toBe("/account");
  });

  it("drops the router's _rsc marker", () => {
    expect(signInNext("/account", "?view=admin&_rsc=1a2b3")).toBe("/account?view=admin");
    expect(signInNext("/people/new", "?_rsc=abc")).toBe("/people/new");
  });

  it("carries nothing when it's where signing in lands anyway", () => {
    expect(signInNext("/tree", "")).toBeNull();
    expect(signInNext("/tree", "?_rsc=abc")).toBeNull();
  });

  it("carries nothing it wouldn't accept back", () => {
    expect(signInNext("//evil.example", "")).toBeNull();
  });
});
