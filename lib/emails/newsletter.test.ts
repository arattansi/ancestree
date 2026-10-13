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
        {
          by: "Sara Khan",
          byYou: false,
          people: [{ id: "p2", name: "Yusuf Khan", relation: "your first cousin" }],
        },
        { by: null, byYou: true, people: [{ id: "p3", name: "Ali Khan" }, { id: "p4", name: "Zahra Khan" }] },
      ],
      stories: [
        {
          id: "s1",
          about: { id: "p1", name: "Amina Khan" },
          storytellers: [{ id: "p1", name: "Amina Khan" }],
          interviewers: [{ id: "p5", name: "Sara Khan" }, { id: "p6", name: "Ali Khan" }],
        },
      ],
      photos: [],
    },
  ],
  week: [occasion({})],
  later: [],
  ...over,
});

const render = (i: Issue, note?: string | null) =>
  newsletterEmail({
    issue: i,
    note,
    storyUrl: (id) => `https://www.ancestree.space/stories/${id}`,
    personUrl: (id) => `https://www.ancestree.space/family?person=${id}`,
    familyUrl: "https://www.ancestree.space/family",
    unsubscribeUrl: "https://www.ancestree.space/newsletter/tok-1",
    inviteUrl: "https://www.ancestree.space/account/admin?tree=t1&section=invite-to-claim",
  });

describe("newsletterEmail", () => {
  it("offers to invite family, naming nobody (Step 144)", () => {
    const { html } = render(issue());
    expect(html).toContain(">invite family</a>");
    expect(html).not.toContain("Invite Family");
    expect(html).not.toContain("on ancestree yet");
  });

  it("puts invite family first, beside open my family tree", () => {
    const { html } = render(issue());
    const invite = html.indexOf(">invite family</a>");
    const open = html.indexOf(">open my family tree</a>");
    expect(invite).toBeGreaterThan(-1);
    expect(open).toBeGreaterThan(invite);
    // Both in the one row, nothing but the other button between them.
    expect(html.slice(invite, open)).not.toMatch(/<p\b/);
    expect(html.match(/display:inline-table/g)).toHaveLength(2);
  });

  it("says what each one added is to the reader (Step 144)", () => {
    const { html } = render(issue());
    expect(html).toMatch(/Sara Khan added <a[^>]*>Yusuf Khan<\/a> \(your first cousin\)\./);
  });

  it("links each story, with who told it and who asked (Step 144)", () => {
    const { html } = render(issue());
    expect(html).toContain(
      '<a href="https://www.ancestree.space/stories/s1" style="color:#0a0a0a;text-decoration:underline;">A story</a> about <a',
    );
    expect(html).toMatch(
      /Told by <a[^>]*>Amina Khan<\/a>; interviewed by <a[^>]*>Sara Khan<\/a> and <a[^>]*>Ali Khan<\/a>\./,
    );
  });

  it("says just that of a story with no credits", () => {
    const { html } = render(
      issue({
        trees: [
          {
            id: "t1",
            name: "Khan family",
            joined: [],
            added: [],
            stories: [
              {
                id: "s2",
                about: { id: "p1", name: "Amina Khan" },
                storytellers: [],
                interviewers: [],
              },
            ],
            photos: [],
          },
        ],
      }),
    );
    expect(html).toMatch(/>A story<\/a> about <a[^>]*>Amina Khan<\/a>\.<\/p>/);
  });

  it("never shows a story's title (Aalim, 2026-10-12)", () => {
    const { html } = render(issue());
    expect(html).not.toContain("&ldquo;");
  });

  it("asks for a story in a week with none (Step 144)", () => {
    const quiet = issue();
    quiet.trees[0].stories = [];
    const { html } = render(quiet);
    expect(html).toContain("Share a Story");
    expect(html).toContain("No new stories this week.");
    expect(html).toMatch(/href="https:\/\/www\.ancestree\.space\/family"[^>]*>write a story<\/a>/);
    expect(render(issue()).html).not.toContain("write a story");
  });

  it("puts the beta reviewers' note above the greeting, escaped, its lines kept (Step 144)", () => {
    const { html } = render(issue(), "Eid Mubarak <3\nSee you Sunday.");
    expect(html).toContain("Eid Mubarak &lt;3<br />See you Sunday.");
    // Above the greeting (Aalim, 2026-10-12), not under it.
    expect(html.indexOf("Eid Mubarak")).toBeLessThan(
      html.indexOf(">Your family this week</p>"),
    );
  });

  it("has no note when there's none", () => {
    expect(render(issue(), "  ").html).not.toContain("<br />See");
  });

  it("names who added whom on each tree, and links every name to its card", () => {
    const { subject, html } = render(issue());
    expect(subject).toBe("Your family this week");
    expect(html).toContain("Khan family");
    expect(html).toMatch(/Sara Khan added <a href="https:\/\/www\.ancestree\.space\/family\?person=p2"[^>]*>Yusuf Khan<\/a> \(your first cousin\)\./);
    expect(html).toMatch(/You added <a[^>]*>Ali Khan<\/a> and <a[^>]*>Zahra Khan<\/a>\./);
    expect(html).toMatch(/>A story<\/a> about <a[^>]*>Amina Khan<\/a>\./);
    expect(html).toContain("open my family tree");
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
