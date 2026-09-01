/**
 * Shared HTML shell for ancestree's own transactional emails (as opposed to
 * the Supabase Auth templates in supabase/templates/, which are a separate
 * pipeline — see supabase/templates/_shared.md). One renderer keeps every
 * "you're invited" variant visually identical; only the body paragraph and
 * greeting differ between an approved public request and a direct admin
 * send.
 */
export function renderInviteEmail(input: {
  /** Already HTML-escaped. */
  firstName: string;
  /** Pre-built HTML for the paragraph under the greeting — caller escapes any interpolated names. */
  bodyHtml: string;
  /** Our own https://…/join/<token> URL — never user-supplied text, safe to interpolate raw. */
  url: string;
}): string {
  const { firstName, bodyHtml, url } = input;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>You&rsquo;re invited to ancestree</title>
  </head>
  <body style="margin:0;padding:0;background-color:#fafafa;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      You&rsquo;re invited to help build the family tree on ancestree.
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
                  ${bodyHtml}
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
                  Didn&rsquo;t expect this? You can ignore this email &mdash;
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
}

/** Plain text — subject lines aren't HTML, so a real apostrophe, not &rsquo;. */
export const INVITE_EMAIL_SUBJECT = "You’re invited to ancestree";
