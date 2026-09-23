# Design system

The rules the interface follows, so a new screen looks like the rest. Add
to this file when a rule is decided; cite it from the code that applies it.

## Wording

### Titles: Title Case

Card titles, section titles and page headings capitalise every major word:
**Your Account**, **Your Trees**, **Your Entry**, **Privacy & Your Data**,
**Who's on the Tree**, **Invite a Relative to Family**. Short function words
stay lower-case inside a title — *a, an, the, to, of, on, in, for, from,
and, or, &* — but are capitalised when they come first.

This applies to `CardTitle`, `AdminGroup` and `AdminSubsection` titles, and
the `h1` of a page. A table of contents that points at sections (the admin
side nav) repeats their titles, so it uses the same case.

Descriptions, labels, buttons, hints and body copy stay in sentence case.

### Navigation buttons: lower-case

Buttons that move you between pages or views are all lower-case: the
header's **tree**, **connections**, **account** and **sign in**; the account
page's view toggle **profile**, **admin**, **settings**. The tree switcher
shows a tree's name, which keeps its own capitalisation.

Buttons that *do* something — **Save**, **Rename**, **Start my tree**,
**Sign out** — are sentence case, like any other button.

The home page's calls to action count as navigation, so they're lower-case
too — **view your tree**, **sign in**, **request access**, **start a tree
(beta)** — even the ones that open a dialog rather than a page. Inside the
dialog, titles and buttons go back to sentence case (**Request access**,
**Join the waitlist**), as dialog titles are everywhere. **sign in** stays
the filled one, for members coming back; the sentence-case line under the
buttons tells a newcomer that ancestree is invite-only (Step 30.4).

## Layout

- Pages sit in a centred column: `max-w-3xl` for the account page and admin
  console, `max-w-2xl` for forms, `max-w-lg` for short pages, `max-w-5xl`
  for the header.
- Settings-style pages lay cards out in two columns (`grid gap-6
  md:grid-cols-2`); a card that needs the width spans both
  (`md:col-span-2`). Cards keep their natural height; don't stretch one to
  match its neighbour, trim its copy instead.
- The header is three columns: the mark, the tree switcher centred (only
  for someone with more than one tree to look at), and the navigation
  buttons right-aligned.
- A node's details sheet (a person's or a companion's) never covers the
  header's buttons. From `sm` up the header moves aside and lays out to the
  left of the 24rem sheet, the wordmark giving way to the mark where that's
  tight; on a phone the sheet starts under the header. Mark any new sheet
  that sits beside the canvas `data-docked-sheet` to get the same
  (`app/globals.css`).
