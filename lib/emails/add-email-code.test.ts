import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { addEmailCodeEmail } from "@/lib/emails/add-email-code";

describe("adding an email's code (Step 202.4)", () => {
  const { subject, html } = addEmailCodeEmail("042917");

  it("carries the code in the subject and the body", () => {
    expect(subject).toBe("042917 is your ancestree code");
    expect(html).toContain(">042917</span>");
  });

  it("has nothing to tap", () => {
    expect(html).not.toContain("<a href");
    expect(html).not.toContain("If the button doesn");
  });
});
