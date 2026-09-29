import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { placementAskedEmail } from "@/lib/emails/placement-asked";
import { asksHref } from "@/lib/tree-links";

const SITE = "https://www.ancestree.space";

describe("placementAskedEmail (Step 80)", () => {
  const owner = {
    kind: "owner" as const,
    placerName: "Raiya Suleman",
    treeName: "The Suleman Tree",
    homeTreeName: "The Rattansi Tree",
    entries: 1,
    personName: "Zahra Rattansi",
    url: `${SITE}${asksHref()}`,
  };
  const steward = { ...owner, kind: "steward" as const };

  it("asks a member about their own entry, naming who asks and the tree", () => {
    const { subject, html } = placementAskedEmail(owner);
    expect(subject).toBe(
      "Raiya Suleman would like to show your full entry on The Suleman Tree",
    );
    expect(html).toContain(
      "Raiya Suleman would like to show your full entry on The Suleman Tree</p>",
    );
  });

  it("says what shows already, and what waits for their yes", () => {
    const { html } = placementAskedEmail(owner);
    expect(html).toMatch(
      /Your name and place of birth are on The Suleman Tree already\./,
    );
    expect(html).toMatch(/show there only if\s+you approve\./);
  });

  it("opens Asked of You on their account", () => {
    const { html } = placementAskedEmail(owner);
    expect(html).toContain(
      `href="${SITE}/account?view=settings#asked-of-you"`,
    );
    expect(html).toContain(">Approve or decline</a>");
  });

  it("names the one entry someone who may edit it is asked about", () => {
    const { subject, html } = placementAskedEmail(steward);
    expect(subject).toBe(
      "Raiya Suleman would like to show Zahra Rattansi’s full entry on The Suleman Tree",
    );
    expect(html).toContain("Zahra Rattansi&rsquo;s full entry");
    expect(html).toMatch(/who can edit the entry on\s+The Rattansi Tree approves/);
    expect(html).toContain(">Approve or decline</a>");
  });

  it("counts them when there are several, and says where they're from", () => {
    const { subject, html } = placementAskedEmail({
      ...steward,
      entries: 12,
      personName: null,
    });
    expect(subject).toBe(
      "Raiya Suleman would like to show 12 full entries from The Rattansi Tree on The Suleman Tree",
    );
    expect(html).toContain("12 full entries from The Rattansi Tree");
    expect(html).toContain(">Review them</a>");
  });

  it("says one answer answers for everyone asked", () => {
    const { html } = placementAskedEmail(steward);
    expect(html).toMatch(/Whoever answers first answers for everyone asked\./);
  });

  it("escapes names in the HTML, and leaves the subject plain", () => {
    const { subject, html } = placementAskedEmail({
      ...owner,
      placerName: `<b>Raiya</b> O'Brien`,
      treeName: "Suleman & Sons",
    });
    expect(subject).toBe(
      "<b>Raiya</b> O'Brien would like to show your full entry on Suleman & Sons",
    );
    expect(html).not.toContain("<b>Raiya</b>");
    expect(html).toContain("&lt;b&gt;Raiya&lt;/b&gt; O&#39;Brien");
    expect(html).toContain("Suleman &amp; Sons");
  });

  it("keeps a name on one line", () => {
    const { subject } = placementAskedEmail({
      ...owner,
      placerName: "Raiya\n Suleman",
    });
    expect(subject.startsWith("Raiya Suleman would like")).toBe(true);
  });

  it("still reads when a name is missing", () => {
    const { subject } = placementAskedEmail({
      ...steward,
      placerName: " ",
      personName: null,
      homeTreeName: null,
    });
    expect(subject).toBe(
      "A relative would like to show a full entry from your tree on The Suleman Tree",
    );
  });

  it("says when the ask lapses (Step 83)", () => {
    for (const input of [owner, steward]) {
      expect(placementAskedEmail(input).html).toContain(
        "The ask lapses 30 days after it was made.",
      );
    }
  });

  it("says so when it's the reminder, and is otherwise the same ask", () => {
    const first = placementAskedEmail(owner);
    const again = placementAskedEmail({ ...owner, reminder: true });
    expect(again.subject).toBe(`Reminder: ${first.subject}`);
    expect(again.html).toContain(
      "Raiya Suleman would like to show your full entry on The Suleman Tree</p>",
    );
    expect(again.html).toContain(">Approve or decline</a>");

    const several = placementAskedEmail({
      ...steward,
      entries: 3,
      personName: null,
      reminder: true,
    });
    expect(several.subject).toBe(
      "Reminder: Raiya Suleman would like to show 3 full entries from The Rattansi Tree on The Suleman Tree",
    );
  });
});
