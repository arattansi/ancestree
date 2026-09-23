import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { openConsoleHref } from "@/lib/admin-queue";
import { accessRequestedEmail } from "@/lib/emails/access-requested";
import { inviteApprovedEmail } from "@/lib/emails/invite-approved";
import { alertCapNoteHtml, oneLine } from "@/lib/emails/shared";
import { treeRequestedEmail } from "@/lib/emails/tree-requested";
import { ACCESS_REQUEST_ALERT_CAP, WAITLIST_ALERT_CAP } from "@/lib/request-alerts";

const TREE = "6f1c2b3a-0000-4000-8000-000000000001";
const SITE = "https://www.ancestree.space";

describe("accessRequestedEmail", () => {
  const base = {
    firstName: "Zahra",
    lastName: "Suleman",
    treeName: "Family Tree",
    url: `${SITE}${openConsoleHref("invite-requests", TREE)}`,
    cap: ACCESS_REQUEST_ALERT_CAP,
  };

  it("says who asked and which tree, in the subject and the heading", () => {
    const { subject, html } = accessRequestedEmail(base);
    expect(subject).toBe("Zahra Suleman asked to join Family Tree on ancestree");
    expect(html).toContain("Zahra Suleman asked to join Family Tree</p>");
    expect(html).toContain("You&rsquo;re a Root of Family Tree");
  });

  it("links straight to the request, its & escaped for HTML", () => {
    const { html } = accessRequestedEmail(base);
    const href = `${SITE}/account/admin?tree=${TREE}&amp;section=invite-requests`;
    expect(html).toContain(`href="${href}"`);
    // The copy to paste reads right: an unescaped "&sect" would show as "§".
    expect(html).toContain(`>${href}</a>`);
    expect(html).not.toContain("?tree=" + TREE + "&section");
  });

  it("escapes the names people typed, in the HTML and nowhere else", () => {
    const { subject, html } = accessRequestedEmail({
      ...base,
      firstName: `<script>alert("x")</script>`,
      lastName: "O'Brien & Co",
      treeName: "The <b>Best</b> Tree",
    });
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<b>Best</b>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(html).toContain("O&#39;Brien &amp; Co");
    expect(html).toContain("The &lt;b&gt;Best&lt;/b&gt; Tree");
    // A subject is plain text: never escaped.
    expect(subject).toBe(
      `<script>alert("x")</script> O'Brien & Co asked to join The <b>Best</b> Tree on ancestree`,
    );
  });

  it("keeps a subject to one line, whatever was typed", () => {
    const { subject } = accessRequestedEmail({
      ...base,
      firstName: "Zahra\r\nBcc: someone@example.com",
      lastName: "  Suleman\t",
    });
    expect(subject).toBe(
      "Zahra Bcc: someone@example.com Suleman asked to join Family Tree on ancestree",
    );
    expect(subject).not.toMatch(/[\r\n\t]/);
  });

  it("says nothing about the cap until the alert that uses it up", () => {
    expect(accessRequestedEmail(base).html).not.toContain("hold off");
    const { html } = accessRequestedEmail({ ...base, lastFor: "hour" });
    expect(html).toContain("That&rsquo;s 5 requests to join it in an hour");
    expect(html).toContain("still\n                  wait for you in the admin console");
    expect(accessRequestedEmail({ ...base, lastFor: "day" }).html).toContain(
      "That&rsquo;s 20 requests to join it in a day",
    );
  });
});

describe("treeRequestedEmail", () => {
  const base = {
    firstName: "Imran",
    lastName: "Suleman",
    url: `${SITE}${openConsoleHref("tree-requests")}`,
    cap: WAITLIST_ALERT_CAP,
  };

  it("tells a waitlist sign-up from a member's ask", () => {
    const waitlist = treeRequestedEmail({ ...base, kind: "waitlist" });
    const member = treeRequestedEmail({ ...base, kind: "member" });
    expect(waitlist.subject).toBe("Imran Suleman asked to start a tree on ancestree");
    expect(member.subject).toBe(waitlist.subject);
    expect(waitlist.html).toContain("joined the waitlist");
    expect(waitlist.html).toContain("founder invite");
    expect(member.html).toContain("already a member");
    expect(member.html).not.toContain("waitlist");
  });

  it("links to the queue on a console they run", () => {
    const { html } = treeRequestedEmail({ ...base, kind: "waitlist" });
    expect(html).toContain(`href="${SITE}/account/admin?section=tree-requests"`);
  });

  it("copes with a member whose entry has no last name", () => {
    const { subject, html } = treeRequestedEmail({ ...base, kind: "member", lastName: "" });
    expect(subject).toBe("Imran asked to start a tree on ancestree");
    expect(html).toContain("Imran asked to start a tree</p>");
  });

  it("escapes the name", () => {
    const { html } = treeRequestedEmail({ ...base, kind: "waitlist", firstName: "<img src=x>" });
    expect(html).not.toContain("<img src=x>");
    expect(html).toContain("&lt;img src=x&gt;");
  });

  it("says when the waitlist's cap is used up", () => {
    const { html } = treeRequestedEmail({ ...base, kind: "waitlist", lastFor: "hour" });
    expect(html).toContain("That&rsquo;s 10 requests from the waitlist in an hour");
  });
});

describe("the other emails' links", () => {
  it("are unchanged by escaping, having nothing to escape", () => {
    const url = `${SITE}/join/0123abcd`;
    const { html } = inviteApprovedEmail({ firstName: "Zahra", inviterName: "Aalim", url });
    expect(html).toContain(`href="${url}"`);
    expect(html).toContain(`>${url}</a>`);
  });
});

describe("oneLine", () => {
  it("collapses every run of whitespace", () => {
    expect(oneLine("  a\n\tb  c ")).toBe("a b c");
  });
});

describe("alertCapNoteHtml", () => {
  it("is empty until a cap is used up", () => {
    expect(alertCapNoteHtml(null, ACCESS_REQUEST_ALERT_CAP, "requests")).toBe("");
    expect(alertCapNoteHtml(undefined, ACCESS_REQUEST_ALERT_CAP, "requests")).toBe("");
  });
});
