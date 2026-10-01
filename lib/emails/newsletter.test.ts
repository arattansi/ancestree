import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { NAMES_SHOWN, newsletterEmail, preheaderOf } from "@/lib/emails/newsletter";
import type { Issue, IssueOccasion } from "@/lib/newsletter";
import { coupleDisplayName } from "@/lib/person-name";

const occasion = (o: Partial<IssueOccasion>): IssueOccasion => ({
  kind: "birthday",
  people: ["p1"],
  date: "2026-10-06",
  daysAway: 2,
  years: 34,
  name: "Amina Khan",
  milestone: false,
  ...o,
});

const issue = (over: Partial<Issue> = {}): Issue => ({
  trees: [
    {
      id: "t1",
      name: "Khan family",
      joined: [],
            added: [
        { by: "Sara Khan", byYou: false, people: [{ id: "p2", name: "Yusuf Khan" }] },
        { by: null, byYou: true, people: [{ id: "p3", name: "Ali Khan" }, { id: "p4", name: "Zahra Khan" }] },
      ],
      stories: [{ id: "p1", name: "Amina Khan" }],
      photos: [],
    },
  ],
  week: [occasion({})],
  later: [],
  ...over,
});

const render = (i: Issue) =>
  newsletterEmail({
    issue: i,
    personUrl: (id) => `https://www.ancestree.space/family?person=${id}`,
    familyUrl: "https://www.ancestree.space/family",
    unsubscribeUrl: "https://www.ancestree.space/newsletter/tok-1",
  });

describe("newsletterEmail", () => {
  it("names who added whom on each tree, and links every name to its card", () => {
    const { subject, html } = render(issue());
    expect(subject).toBe("Your family this week");
    expect(html).toContain("Khan family");
    expect(html).toMatch(/Sara Khan added <a href="https:\/\/www\.ancestree\.space\/family\?person=p2"[^>]*>Yusuf Khan<\/a>\./);
    expect(html).toMatch(/You added <a[^>]*>Ali Khan<\/a> and <a[^>]*>Zahra Khan<\/a>\./);
    expect(html).toMatch(/A new story about <a[^>]*>Amina Khan<\/a>\./);
    expect(html).toContain("Open My Family Tree");
  });

  it("says who joined, apart from whom anyone added", () => {
    const { html } = render(
      issue({
        trees: [
          {
            id: "t1",
            name: "Khan family",
            joined: [{ id: "p7", name: "Safia Gulamani" }],
            added: [],
            stories: [],
            photos: [],
          },
        ],
      }),
    );
    expect(html).toMatch(/<a[^>]*>Safia Gulamani<\/a> joined\./);
    expect(html).not.toMatch(/added <a/);
  });

  it("says who was added when nobody is recorded", () => {
    const { html } = render(
      issue({
        trees: [
          {
            id: "t1",
            name: "Khan family",
            joined: [],
            added: [{ by: null, byYou: false, people: [{ id: "p2", name: "Yusuf Khan" }] }],
            stories: [],
            photos: [{ id: "p2", name: "Yusuf Khan" }, { id: "p3", name: "Ali Khan" }],
          },
        ],
      }),
    );
    expect(html).toMatch(/<a[^>]*>Yusuf Khan<\/a> was added\./);
    expect(html).toMatch(/New photos of <a[^>]*>Yusuf Khan<\/a> and <a[^>]*>Ali Khan<\/a>\./);
  });

  it(`lists ${NAMES_SHOWN} names and counts the rest`, () => {
    const many = Array.from({ length: 104 }, (_, i) => ({ id: `x${i}`, name: `Person ${i}` }));
    const { html } = render(
      issue({
        trees: [{ id: "t1", name: "T", joined: [],
            added: [{ by: "Raiya", byYou: false, people: many }], stories: [], photos: [] }],
      }),
    );
    expect(html).toContain(">Person 5</a> and 98 more.");
    expect(html).not.toContain(">Person 6</a>");
  });

  it("escapes every name and tree name", () => {
    const { html } = render(
      issue({
        trees: [
          {
            id: "t1",
            name: "<b>Khan</b>",
            joined: [],
            added: [{ by: `<i>Sara</i>`, byYou: false, people: [{ id: "p2", name: `O'Brien <script>` }] }],
            stories: [],
            photos: [],
          },
        ],
        week: [occasion({ name: "<img src=x>" })],
      }),
    );
    expect(html).not.toContain("<b>Khan</b>");
    expect(html).not.toContain("<i>Sara</i>");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;b&gt;Khan&lt;/b&gt;");
    expect(html).toContain("O&#39;Brien &lt;script&gt;");
  });

  it("dates what's coming up and marks the round ones", () => {
    const { html } = render(
      issue({
        week: [
          occasion({ daysAway: 0, date: "2026-10-04", years: 34 }),
          occasion({ daysAway: 1, date: "2026-10-05", years: null, name: "Ali Khan" }),
          occasion({
            kind: "anniversary",
            people: ["p5", "p6"],
            daysAway: 3,
            date: "2026-10-07",
            years: 25,
            name: "Ahmed & Sara Khan",
            milestone: true,
          }),
        ],
        later: [occasion({ daysAway: 20, date: "2026-10-24", years: 50, name: "Zahra Khan", milestone: true })],
      }),
    );
    expect(html).toContain(">Today</td>");
    expect(html).toContain(">Tomorrow</td>");
    expect(html).toContain(">Wed 7 Oct</td>");
    expect(html).toMatch(/<a[^>]*>Amina Khan<\/a> turns 34/);
    expect(html).toMatch(/<a[^>]*>Ali Khan<\/a>&rsquo;s birthday/);
    expect(html).toMatch(/<a[^>]*>Ahmed &amp; Sara Khan<\/a>&rsquo;s 25th anniversary <span[^>]*>Milestone<\/span>/);
    expect(html).toContain("Later This Month");
    expect(html).toMatch(/>Sat 24 Oct<\/td>[\s\S]*Zahra Khan<\/a> turns 50 <span[^>]*>Milestone/);
  });

  it("puts what's coming up before each tree's news", () => {
    const { html } = render(
      issue({ later: [occasion({ daysAway: 20, years: 50, milestone: true })] }),
    );
    const week = html.indexOf(">This Week<");
    const later = html.indexOf(">Later This Month<");
    const tree = html.indexOf(">Khan family<");
    expect(week).toBeGreaterThan(0);
    expect(week).toBeLessThan(later);
    expect(later).toBeLessThan(tree);
  });

  it("leaves out the sections with nothing in them", () => {
    const { html } = render(issue({ trees: [], later: [] }));
    expect(html).not.toContain("Khan family");
    expect(html).not.toContain("Later This Month");
    expect(html).toContain("This Week");
  });

  it("carries the unsubscribe link in the small print", () => {
    const { html } = render(issue());
    expect(html).toContain('href="https://www.ancestree.space/newsletter/tok-1"');
    expect(html).toContain(">Unsubscribe</a>");
  });
});

describe("preheaderOf", () => {
  it("counts what's in it", () => {
    expect(
      preheaderOf(
        issue({
          week: [
            occasion({}),
            occasion({ kind: "anniversary", people: ["a", "b"] }),
            occasion({ name: "B" }),
          ],
          later: [occasion({ daysAway: 20, milestone: true })],
        }),
      ),
    ).toBe(
      "2 birthdays this week · 1 anniversary this week · 1 milestone later this month · 3 added · 1 new story",
    );
  });
});

describe("coupleDisplayName", () => {
  it("shares one surname, or names both in full", () => {
    const a = { first_name: "Ahmed", last_name: "Khan" };
    expect(coupleDisplayName(a, { first_name: "Sara", preferred_name: null, last_name: "Khan" })).toBe(
      "Ahmed & Sara Khan",
    );
    expect(coupleDisplayName(a, { first_name: "Sara", last_name: "Jaffer" })).toBe(
      "Ahmed Khan & Sara Jaffer",
    );
    expect(coupleDisplayName(a, undefined)).toBe("Ahmed Khan");
  });
});
