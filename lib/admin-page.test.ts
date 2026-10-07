import { describe, expect, it } from "vitest";

import { adminPageHref, readAdminTab } from "@/lib/admin-page";

describe("readAdminTab", () => {
  it("reads each tab, and the first for anything else", () => {
    expect(readAdminTab("analytics")).toBe("analytics");
    expect(readAdminTab("manage")).toBe("manage");
    expect(readAdminTab("blog")).toBe("blog");
    expect(readAdminTab("newsletter")).toBe("newsletter");
    expect(readAdminTab(undefined)).toBe("newsletter");
    expect(readAdminTab(["manage"])).toBe("newsletter");
    expect(readAdminTab("dashboard")).toBe("newsletter");
  });
});

describe("adminPageHref", () => {
  it("leaves the first tab bare and names the rest, round-tripping", () => {
    expect(adminPageHref()).toBe("/admin");
    expect(adminPageHref("newsletter")).toBe("/admin");
    expect(adminPageHref("manage")).toBe("/admin?tab=manage");
    expect(adminPageHref("blog")).toBe("/admin?tab=blog");
    const url = new URL(adminPageHref("analytics"), "https://www.ancestree.space");
    expect(readAdminTab(url.searchParams.get("tab"))).toBe("analytics");
  });
});
