# Auth email templates

Source of truth for the branded Supabase Auth emails. These files are wired
into `supabase/config.toml` for local development; for the hosted project they
must also be pasted into the Dashboard (Authentication → Emails → Templates)
or pushed with the Management API — Supabase does not read them from the repo.

**This is only sign-in mail.** The other branded email ancestree sends — the
"you're invited" message when an admin approves an invite request — is not a
Supabase Auth template at all. It's authored in `lib/emails/invite-approved.ts`
and sent by `approveInviteRequest` via Resend directly (`lib/email.ts`), since
the link it carries is our own `/join/<token>` route, not a Supabase auth
link. Same palette, same layout, different pipeline — edit it in that file,
not here, and it needs no push step since it's sent by app code.

Which template fires for our magic-link sign-in (`signInWithOtp`):

| Situation | Template |
|---|---|
| Email has never signed in before | **Confirm signup** (`confirm-signup.html`) |
| Email already exists in `auth.users` | **Magic Link** (`magic-link.html`) |

Both must be branded or half of new relatives get the stock Supabase email.

Design notes:

- Palette is the app's own (Tailwind neutral): page `#fafafa`, card `#ffffff`,
  border `#e5e5e5`, text `#0a0a0a`, muted `#737373`, button `#171717`/`#fafafa`,
  radius 10px = the app's `--radius: 0.625rem`.
- Public Sans is not loadable in Gmail/Outlook, so the stack falls back to the
  recipient's system sans. Everything else matches the homepage.
- **The link is built by hand, not with `{{ .ConfirmationURL }}`.** That
  variable points at `<project-ref>.supabase.co/auth/v1/verify?...`, so the
  address the recipient sees (and hovers) is a Supabase URL, not ours. Instead:

      {{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=email

  `{{ .RedirectTo }}` is the `emailRedirectTo` we passed to `signInWithOtp`,
  already carrying `?next=/tree` and, for an invited relative, `&invite=<token>`
  — which is why it has to be the base rather than `{{ .SiteURL }}`, and why
  the extra params are appended with `&`. `/auth/callback` already handles this
  shape: it reads `token_hash` + `type` and calls `verifyOtp`.
- Either way the recipient must open the link in the browser that requested it
  (PKCE keeps the code verifier in a cookie). That is unchanged from before.
- Inline styles + table layout only — email clients strip `<style>` blocks and
  ignore flex/grid.
