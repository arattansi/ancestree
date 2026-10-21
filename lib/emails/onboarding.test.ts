import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  campaignEmail,
  campaignUrl,
  LAST_SUBJECT,
  namesList,
  onboardingEmail,
  stepCopy,
  WINBACK_SUBJECT,
  type OnboardingEmailInput,
} from "@/lib/emails/onboarding";
import type { Issue } from "@/lib/newsletter";

const urls = {
  claim: "https://www.ancestree.space/account?view=settings#people-you-added",
  invite: "https://www.ancestree.space/account?view=settings#invite-t1",
  family: "https://www.ancestree.space/people/new?relatedTo=me",
  home: "https://www.ancestree.space/family",
  unsubscribe: "https://www.ancestree.space/getting-started/tok",
  personUrl: (id: string) => `https://www.ancestree.space/family?person=${id}`,
  storyUrl: (id: string) => `https://www.ancestree.space/stories/${id}`,
};

function input(over: Partial<OnboardingEmailInput> = {}): OnboardingEmailInput {
  return {
    kind: "claim",
    step: "claim",
    reminder: false,
    people: ["Amina Khan", "Yusuf Khan", "Zahra Khan"],
    runsTree: false,
    recap: null,
    urls,
    ...over,
  };
}

const recap: Issue = {
  messages: [],
  trees: [
    {
      id: "t1",
      name: "The Khan Family",
      joined: [{ id: "p1", name: "Sara Khan", relation: "your aunt" }],
      added: [],
      stories: [],
      photos: [],
    },
  ],
  week: [],
  later: [],
};

describe("names", () => {
  it("lists a few, then counts the rest", () => {
    expect(namesList(["A"])).toBe("A");
    expect(namesList(["A", "B"])).toBe("A and B");
    expect(namesList(["A", "B", "C"])).toBe("A, B and C");
    expect(namesList(["A", "B", "C", "D", "E", "F", "G", "H"])).toBe(
      "A, B, C, D, E, F and 2 more",
    );
  });
});

describe("each step's words", () => {
  it("asks to invite the people they added, by name", () => {
    const c = stepCopy(input());
    expect(c.subject).toBe("Invite the 3 people you added");
    expect(c.body).toBe(
      "You added Amina Khan, Yusuf Khan and Zahra Khan. Invite them to claim their entries and fill in what they know.",
    );
    expect(c.cta).toEqual({ label: "invite them", url: urls.claim });
  });

  it("names one person in the subject", () => {
    const c = stepCopy(input({ people: ["Amina Khan"] }));
    expect(c.subject).toBe("Invite Amina Khan to ancestree");
    expect(c.body).toContain("claim their entry ");
  });

  it("reminds about who's still to invite, briefly", () => {
    const c = stepCopy(input({ reminder: true }));
    expect(c.subject).toBe("Still to invite: Amina Khan and 2 more");
    expect(c.body).toBe(
      "Amina Khan, Yusuf Khan and Zahra Khan haven’t been invited to ancestree yet.",
    );
    expect(stepCopy(input({ reminder: true, people: ["Amina Khan"] })).body).toBe(
      "Amina Khan hasn’t been invited to ancestree yet.",
    );
  });

  it("offers a Root the family link, anyone else an invite", () => {
    expect(stepCopy(input({ step: "invite", runsTree: true })).cta.label).toBe(
      "share the family link",
    );
    expect(stepCopy(input({ step: "invite" })).cta).toEqual({
      label: "invite family",
      url: urls.invite,
    });
  });

  it("keeps every button lower-case (Step 102)", () => {
    for (const step of ["claim", "invite", "family", "story"] as const) {
      for (const runsTree of [false, true]) {
        const { label } = stepCopy(input({ step, runsTree })).cta;
        expect(label).toBe(label.toLowerCase());
      }
    }
  });
});

describe("the email", () => {
  it("is the step alone, with its own way out", () => {
    const { subject, html } = onboardingEmail(input());
    expect(subject).toBe("Invite the 3 people you added");
    expect(html).toContain("Amina Khan, Yusuf Khan and Zahra Khan");
    expect(html).toContain(
      'href="https://www.ancestree.space/account?view=settings&amp;utm_source=ancestree&amp;utm_medium=email&amp;utm_campaign=getting-started&amp;utm_content=claim&amp;utm_term=button#people-you-added"',
    );
    expect(html).toContain(urls.unsubscribe);
    expect(html).toContain("Tips for your first weeks on ancestree.");
  });

  it("escapes the names it's given", () => {
    const { html } = onboardingEmail(input({ people: ["<b>Amina</b> Khan"] }));
    expect(html).not.toContain("<b>Amina</b>");
    expect(html).toContain("&lt;b&gt;Amina&lt;/b&gt; Khan");
  });

  it("wins back with what changed, then the next step", () => {
    const { subject, html } = onboardingEmail(input({ kind: "winback", recap }));
    expect(subject).toBe(WINBACK_SUBJECT);
    expect(html).toContain("Since you were last here");
    expect(html).toContain("The Khan Family");
    expect(html).toContain("Sara Khan</a> (your aunt) joined.");
    // The step comes after the recap (its heading is in the preview line too).
    expect(html.indexOf("Sara Khan")).toBeLessThan(
      html.lastIndexOf("Invite the 3 people you added"),
    );
    expect(html).toContain("open my family tree");
    expect(html).toContain("invite them");
  });

  it("says a month on in the last one", () => {
    expect(onboardingEmail(input({ kind: "last", recap })).subject).toBe(LAST_SUBJECT);
  });

  it("is the step alone when nothing changed while they were away", () => {
    const { subject, html } = onboardingEmail(input({ kind: "winback", recap: null }));
    expect(subject).toBe("Invite the 3 people you added");
    expect(html).not.toContain("Since you were last here");
  });
});

describe("the links, tagged for Analytics (Step 196)", () => {
  it("says which email and which link, keeping the address's own query and fragment", () => {
    expect(campaignUrl(urls.claim, "claim", "button")).toBe(
      "https://www.ancestree.space/account?view=settings&utm_source=ancestree&utm_medium=email&utm_campaign=getting-started&utm_content=claim&utm_term=button#people-you-added",
    );
    expect(campaignUrl(urls.home, "story", "button")).toBe(
      "https://www.ancestree.space/family?utm_source=ancestree&utm_medium=email&utm_campaign=getting-started&utm_content=story&utm_term=button",
    );
  });

  it("names each email: its step, the reminder, or the win-back with its step", () => {
    expect(campaignEmail(input())).toBe("claim");
    expect(campaignEmail(input({ reminder: true }))).toBe("claim-reminder");
    expect(campaignEmail(input({ kind: "invite", step: "invite" }))).toBe("invite");
    expect(campaignEmail(input({ kind: "winback" }))).toBe("winback-claim");
    expect(campaignEmail(input({ kind: "last", step: "story" }))).toBe("last-story");
  });

  it("tags every link but the way out", () => {
    const { html } = onboardingEmail(
      input({
        kind: "winback",
        recap: {
          ...recap,
          trees: [
            {
              ...recap.trees[0],
              stories: [
                {
                  id: "s1",
                  about: [{ id: "p1", name: "Sara Khan" }],
                  storytellers: [],
                  interviewers: [],
                },
              ],
            },
          ],
        },
      }),
    );
    const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
    const out = hrefs.filter((h) => h.startsWith(urls.unsubscribe));
    const tagged = hrefs.filter((h) => !h.startsWith(urls.unsubscribe));
    expect(out.length).toBeGreaterThan(0);
    expect(out.every((h) => !h.includes("utm_"))).toBe(true);
    expect(tagged.length).toBeGreaterThan(3);
    for (const h of tagged) expect(h).toContain("utm_content=winback-claim");
    expect(tagged.some((h) => h.includes("utm_term=button#people-you-added"))).toBe(true);
    expect(tagged.some((h) => h.includes("/family?utm_") && h.includes("utm_term=my-family-tree"))).toBe(true);
    expect(tagged.some((h) => h.includes("/family?person=p1&amp;utm_") && h.endsWith("utm_term=person"))).toBe(true);
    expect(tagged.some((h) => h.includes("/stories/s1?utm_") && h.endsWith("utm_term=story"))).toBe(true);
  });
});
