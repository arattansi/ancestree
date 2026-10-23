import { escapeHtml } from "@/lib/email";
import { renderEmail } from "@/lib/emails/shared";

/**
 * The code that adds an email to an account that joined without one (Step
 * 202.4), as the sign-in email shows its code: on its own, nothing to tap,
 * so a mail scanner opening it spends nothing.
 */
export function addEmailCodeEmail(code: string): { subject: string; html: string } {
  const safe = escapeHtml(code);
  const html = renderEmail({
    title: "Your ancestree code",
    preheader: `${safe} is your code to add this email to ancestree.`,
    heading: "Add this email to ancestree",
    bodyHtml: "Enter the code on ancestree. It works once and expires in an hour.",
    contentHtml: `
                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
                  <tr>
                    <td style="padding:14px 22px;border:1px solid #e5e5e5;border-radius:10px;background-color:#f5f5f5;">
                      <span style="font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;font-size:30px;font-weight:600;line-height:1.2;letter-spacing:6px;color:#0a0a0a;-webkit-user-select:all;user-select:all;">${safe}</span>
                    </td>
                  </tr>
                </table>`,
    footnoteHtml:
      "Didn&rsquo;t ask for it? Ignore this email. Don&rsquo;t share the code with anyone.",
  });
  return { subject: `${code} is your ancestree code`, html };
}
