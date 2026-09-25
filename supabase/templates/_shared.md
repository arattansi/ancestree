# Auth email templates

Source of truth for the branded Supabase Auth emails. These files are wired
into `supabase/config.toml` for local development; for the hosted project they
are pushed with the Management API (`npm run email:push`, never pasted into
the Dashboard) — Supabase does not read them from the repo.

**This is only sign-in mail** (a code since Step 53), which returning
members and people holding a bare or family link get. The other branded email ancestree sends — the "you're
invited" message when an admin approves an invite request or invites someone
by name — is not a Supabase Auth template at all. It's authored in
`lib/emails/invite-approved.ts` and sent by `approveInviteRequest` via Resend
directly (`lib/email.ts`), since the link it carries is our own
`/join/<token>` route, not a Supabase auth link. That invite is bound to the
recipient's address, and accepting it signs them in on the spot
(`signInWithInvite` in `lib/sign-in.server.ts`) — they never see the
templates here until their next sign-in. Same palette, same layout, different pipeline — edit it in that file,
not here, and it needs no push step since it's sent by app code. The same
goes for the rest of `lib/emails/` — founder invites, "you can start your
tree", and the alerts that tell Roots and beta reviewers someone asked (Step
30.1), all through `renderEmail` in `lib/emails/shared.ts`.

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
- The logo is `{{ .SiteURL }}/brand/ancestree-mark-132.png`, shown at 44px —
  a PNG because Gmail and Outlook drop SVG. It is served by the deployed site,
  so a template that points at a new image must not be pushed before the
  deploy carrying that image is live, or the header shows a broken image.
  `npm run brand:build` regenerates it along with the rest of the brand files.
- **The email carries a code, not a link (Step 53).** `{{ .Token }}`, the
  one-time code, sits in the subject ("{{ .Token }} is your ancestree code",
  set by `scripts/push-email-templates.ts`, so it can be read off a
  notification) and once in the body, unbroken, monospace, with
  `user-select: all` so one tap or click selects exactly the digits
  (letter-spacing adds none). There's no link and no button: nothing a mail
  scanner opens can spend it (Outlook/Hotmail Safe Links spent every link
  before the recipient's click until Step 20 moved verifying behind a
  button). Email apps run no scripts, so a "copy" button isn't possible.
  The code is entered where it was asked for (`SignInCodeForm`), which
  also takes a paste however it's spaced and Safari's one-time-code offer
  from Apple Mail.
- Its length is the hosted project's `mailer_otp_length` (8 digits), which
  `SIGN_IN_CODE_LENGTH` in `lib/sign-in-code.ts` must match.
- **Push only once the deploy with the code box is live.** Before it, the
  pages still say to open a link.
- Links in emails sent before Step 53 still work: `/auth/callback`
  forwards a `token_hash` to `/auth/confirm`, whose button spends it.
- Inline styles + table layout only — email clients strip `<style>` blocks and
  ignore flex/grid.
