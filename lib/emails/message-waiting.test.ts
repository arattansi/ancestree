import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { messageWaitingEmail } from "@/lib/emails/message-waiting";
import { messageEmailsPageHref, messagesHref } from "@/lib/tree-links";

const SITE = "https://www.ancestree.space";
const SENDER = "6f1c2b3a-0000-4000-8000-000000000182";
const TOKEN = "6f1c2b3a-0000-4000-8000-0000000001ee";

describe("messageWaitingEmail (Step 182)", () => {
  const base = {
    senderName: "Aalim Rattansi",
    url: `${SITE}${messagesHref(SENDER)}`,
    unsubscribe: `${SITE}${messageEmailsPageHref(TOKEN)}`,
  };

  it("says who wrote, in the subject and the heading, and nothing of what", () => {
    const { subject, html } = messageWaitingEmail(base);
    expect(subject).toBe("Aalim Rattansi wrote to you on ancestree");
    expect(html).toContain("Aalim Rattansi wrote to you</p>");
    expect(html).toContain("Visit ancestree to read it.");
  });

  it("opens the conversation, and unsubscribes signed out", () => {
    const { html } = messageWaitingEmail(base);
    expect(html).toContain(`${SITE}/family?messages=${SENDER}`);
    expect(html).toContain(">read it<");
    expect(html).toContain(`${SITE}/message-emails/${TOKEN}`);
  });

  it("escapes a name, and never leaves it empty", () => {
    expect(messageWaitingEmail({ ...base, senderName: "<b>Zz</b>" }).html).toContain("&lt;b&gt;Zz&lt;/b&gt; wrote to you");
    expect(messageWaitingEmail({ ...base, senderName: "  " }).subject).toBe("A relative wrote to you on ancestree");
  });
});
