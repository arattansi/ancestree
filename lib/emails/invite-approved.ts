import { escapeHtml } from "@/lib/email";

/**
 * "You're invited" email, sent by `approveInviteRequest` once an admin
 * approves a public invite request. Same visual system as the Supabase Auth
 * templates in supabase/templates/ (same palette, same layout) but authored
 * as a TS template — this one is sent by ancestree's own code via Resend,
 * not by Supabase's mailer, so it has no {{ .Go }} template variables.
 */
export function inviteApprovedEmail(input: {
  firstName: string;
  inviterName: string;
  url: string;
}): { subject: string; html: string } {
  const firstName = escapeHtml(input.firstName);
  const inviterName = escapeHtml(input.inviterName);
  // Safe to interpolate raw into href: it's our own https://.../join/<token>
  // URL built from getSiteUrl() + a hex token, never user-supplied text.
  const url = input.url;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>You&rsquo;re invited to ancestree</title>
  </head>
  <body style="margin:0;padding:0;background-color:#fafafa;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${inviterName} invited you to help build the family tree on ancestree.
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">
            <tr>
              <td style="padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

                <p style="margin:0;font-size:28px;line-height:1;">&#127795;</p>
                <p style="margin:16px 0 0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#0a0a0a;">ancestree</p>
                <p style="margin:6px 0 0;font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#0a0a0a;">A space to grow your tree.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:28px 0;"><div style="height:1px;background-color:#e5e5e5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
                </table>

                <p style="margin:0;font-size:16px;font-weight:600;color:#0a0a0a;">You&rsquo;re invited, ${firstName}</p>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#737373;">
                  ${inviterName} approved your request to join the family tree
                  on ancestree. The link below works once and expires in 14
                  days.
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td style="border-radius:10px;background-color:#171717;">
                      <a href="${url}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:1;color:#fafafa;text-decoration:none;border-radius:10px;">Join ancestree</a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:28px 0;"><div style="height:1px;background-color:#e5e5e5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
                </table>

                <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">
                  Didn&rsquo;t request this? You can ignore this email &mdash;
                  the link only works once and nobody can join without it.
                </p>

                <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  If the button doesn&rsquo;t work, paste this into your browser:<br />
                  <a href="${url}" style="color:#737373;word-break:break-all;">${url}</a>
                </p>

              </td>
            </tr>
          </table>

          <p style="margin:20px 0 0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#737373;">
            ancestree &middot; a private, invite-only family tree
          </p>

        </td>
      </tr>
    </table>
  </body>
</html>`;

  // Plain text — subject lines aren't HTML, so a real apostrophe, not &rsquo;.
  return { subject: "You’re invited to ancestree", html };
}
