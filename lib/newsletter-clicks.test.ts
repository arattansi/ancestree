import { describe, expect, it } from "vitest";

import { taggedUrl } from "@/lib/campaign-url";
import {
  isIssueDay,
  isNewsletterSection,
  isRouterRequest,
  newsletterLink,
  NEWSLETTER_SECTIONS,
  readNewsletterClick,
  SECTION_LABELS,
} from "@/lib/newsletter-clicks";

describe("taggedUrl", () => {
  it("adds the five tags, after any query and before a fragment", () => {
    expect(
      taggedUrl("https://www.ancestree.space/account?view=settings#newsletter", "c", "x", "y"),
    ).toBe(
      "https://www.ancestree.space/account?view=settings&utm_source=ancestree&utm_medium=email&utm_campaign=c&utm_content=x&utm_term=y#newsletter",
    );
  });

  it("replaces tags already there rather than doubling them", () => {
    const once = taggedUrl("https://www.ancestree.space/family", "c", "x", "y");
    expect(taggedUrl(once, "c", "a", "b")).toBe(
      "https://www.ancestree.space/family?utm_source=ancestree&utm_medium=email&utm_campaign=c&utm_content=a&utm_term=b",
    );
  });
});

describe("newsletterLink", () => {
  it("tags a link as a block of the issue sent that day, naming nobody", () => {
    expect(
      newsletterLink("https://www.ancestree.space/family?person=p1", "this-week", "2026-11-08"),
    ).toBe(
      "https://www.ancestree.space/family?person=p1&utm_source=ancestree&utm_medium=email&utm_campaign=newsletter&utm_content=this-week&utm_term=2026-11-08",
    );
  });
});

describe("readNewsletterClick", () => {
  const read = (search: string) => readNewsletterClick(new URLSearchParams(search));

  it("reads what newsletterLink wrote", () => {
    const url = new URL(
      newsletterLink("https://www.ancestree.space/family?person=p1", "cards", "2026-11-08"),
    );
    expect(read(url.search)).toEqual({ issueDay: "2026-11-08", section: "cards" });
  });

  it("is every block of the email, and only those", () => {
    for (const section of NEWSLETTER_SECTIONS) {
      expect(read(`utm_campaign=newsletter&utm_content=${section}&utm_term=2026-11-08`)).toEqual({
        issueDay: "2026-11-08",
        section,
      });
      expect(SECTION_LABELS[section]).toBeTruthy();
    }
    expect(read("utm_campaign=newsletter&utm_content=sidebar&utm_term=2026-11-08")).toBeNull();
  });

  it("is null for any other campaign, or a term that isn't a real day", () => {
    expect(read("utm_campaign=getting-started&utm_content=cards&utm_term=2026-11-08")).toBeNull();
    expect(read("utm_campaign=newsletter&utm_content=cards&utm_term=2026-02-31")).toBeNull();
    expect(read("utm_campaign=newsletter&utm_content=cards&utm_term=button")).toBeNull();
    expect(read("utm_campaign=newsletter&utm_content=cards")).toBeNull();
    expect(read("person=p1")).toBeNull();
    expect(read("")).toBeNull();
  });
});

describe("isIssueDay / isNewsletterSection", () => {
  it("wants a real calendar day", () => {
    expect(isIssueDay("2026-11-08")).toBe(true);
    expect(isIssueDay("2028-02-29")).toBe(true);
    expect(isIssueDay("2026-02-29")).toBe(false);
    expect(isIssueDay("2026-1-8")).toBe(false);
    expect(isIssueDay(20261108)).toBe(false);
    expect(isIssueDay(null)).toBe(false);
  });

  it("wants one of the blocks", () => {
    expect(isNewsletterSection("story")).toBe(true);
    expect(isNewsletterSection("")).toBe(false);
    expect(isNewsletterSection(undefined)).toBe(false);
  });
});

describe("isRouterRequest", () => {
  const request = (headers: Record<string, string>, search = "") => ({
    headers: new Headers(headers),
    params: new URLSearchParams(search),
  });

  it("is the router's data request, not a person arriving", () => {
    expect(isRouterRequest(request({ rsc: "1" }))).toBe(true);
    expect(isRouterRequest(request({ "next-router-prefetch": "1" }))).toBe(true);
    expect(isRouterRequest(request({}, "_rsc=abc"))).toBe(true);
    expect(isRouterRequest(request({ accept: "text/html" }))).toBe(false);
  });
});
