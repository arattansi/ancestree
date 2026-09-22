import { getSiteUrl } from "@/lib/site-url";

/**
 * Shared HTML shell for ancestree's own transactional emails (as opposed to
 * the Supabase Auth templates in supabase/templates/, which are a separate
 * pipeline — see supabase/templates/_shared.md). One renderer keeps every
 * message visually identical; the invites differ only in their body
 * paragraph (`renderInviteEmail`), and a message that isn't an invite —
 * "you can start your tree" — brings its own heading, button and small print.
 */
export function renderEmail(input: {
  /** The document title. Already HTML-safe. */
  title: string;
  /** The hidden preview line an inbox shows. Already HTML-safe. */
  preheader: string;
  /** The greeting. Already HTML-escaped. */
  heading: string;
  /** Pre-built HTML for the paragraph under the greeting — caller escapes any interpolated names. */
  bodyHtml: string;
  /** The button. `url` is our own address — never user-supplied text, safe to interpolate raw. */
  cta: { label: string; url: string };
  /** The small print under the divider. Already HTML-safe. */
  footnoteHtml: string;
}): string {
  const { title, preheader, heading, bodyHtml, cta, footnoteHtml } = input;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="light" />
    <meta name="supported-color-schemes" content="light" />
    <title>${title}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#fafafa;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">
      ${preheader}
    </div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fafafa;">
      <tr>
        <td align="center" style="padding:48px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:440px;background-color:#ffffff;border:1px solid #e5e5e5;border-radius:10px;">
            <tr>
              <td style="padding:40px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

                <img src="${getSiteUrl()}/brand/ancestree-mark-132.png" width="44" height="44" alt="" style="display:block;width:44px;height:44px;border:0;" />
                <p style="margin:16px 0 0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:#0a0a0a;">ancestree</p>
                <p style="margin:6px 0 0;font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#0a0a0a;">A space to grow your tree.</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:28px 0;"><div style="height:1px;background-color:#e5e5e5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
                </table>

                <p style="margin:0;font-size:16px;font-weight:600;color:#0a0a0a;">${heading}</p>
                <p style="margin:10px 0 0;font-size:15px;line-height:1.6;color:#737373;">
                  ${bodyHtml}
                </p>

                <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                  <tr>
                    <td style="border-radius:10px;background-color:#171717;">
                      <a href="${cta.url}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;font-weight:500;line-height:1;color:#fafafa;text-decoration:none;border-radius:10px;">${cta.label}</a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr><td style="padding:28px 0;"><div style="height:1px;background-color:#e5e5e5;line-height:1px;font-size:0;">&nbsp;</div></td></tr>
                </table>

                <p style="margin:0;font-size:13px;line-height:1.6;color:#737373;">
                  ${footnoteHtml}
                </p>

                <p style="margin:16px 0 0;font-size:13px;line-height:1.6;color:#737373;">
                  If the button doesn&rsquo;t work, paste this into your browser:<br />
                  <a href="${cta.url}" style="color:#737373;word-break:break-all;">${cta.url}</a>
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

/**
 * Every "you're invited" variant: an approved public request, a direct
 * send, a claim invite, a founder invite. Only the body paragraph differs.
 */
export function renderInviteEmail(input: {
  /** Already HTML-escaped. */
  firstName: string;
  /** Pre-built HTML for the paragraph under the greeting — caller escapes any interpolated names. */
  bodyHtml: string;
  /** Our own https://…/join/<token> URL — never user-supplied text, safe to interpolate raw. */
  url: string;
}): string {
  return renderEmail({
    title: "You&rsquo;re invited to ancestree",
    preheader: "You&rsquo;re invited to help build the family tree on ancestree.",
    heading: `You&rsquo;re invited, ${input.firstName}`,
    bodyHtml: input.bodyHtml,
    cta: { label: "Join ancestree", url: input.url },
    footnoteHtml: `Didn&rsquo;t expect this? You can ignore this email &mdash;
                  the link only works once and nobody can join without it.`,
  });
}

/** Plain text — subject lines aren't HTML, so a real apostrophe, not &rsquo;. */
export const INVITE_EMAIL_SUBJECT = "You’re invited to ancestree";
