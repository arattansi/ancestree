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
page's view toggle **profile**, **admin**, **dashboard**, **settings**. The tree switcher
shows a tree's name, which keeps its own capitalisation.

Buttons that *do* something — **Save**, **Rename**, **Start my tree**,
**Sign out** — are sentence case, like any other button. That includes the
header's **Sign out**, which replaces **sign in** for someone signed in who
isn't a member yet (Step 30.8).

The home page's calls to action count as navigation, so they're lower-case
too — **view your tree**, **sign in**, **request access**, **start a tree
(beta)** — even the ones that open a dialog rather than a page. Inside the
dialog, titles and buttons go back to sentence case (**Request access**,
**Join the waitlist**), as dialog titles are everywhere. **sign in** stays
the filled one, for members coming back; the sentence-case line under the
buttons tells a newcomer that ancestree is invite-only (Step 30.4).

A share link's **Ask to join** (Step 41.4) is sentence case. It sits on the
read-only canvas and opens the request form in a dialog over it, so it's an
action there, like **Add a relative** or **Auto-arrange**, rather than a way
to another page. Its dialog is titled **Ask to join** too.

### Forms: labels, not explanations

A form is its labels (Step 58; dialogs and prompts had the same pass in
Step 47). No line under a page or section title saying what the form asks,
no heading naming what the fields already show (**Their details**), and no
helper line under a field or button explaining how it works: file types,
what a preferred name does, where a hidden option lives. A line stays only
where someone can't act rightly without it — what an invite sends, a rule
limiting what this member may add, a warning before a refusal — and then as
one short sentence. Names only some people have (middle, preferred, maiden)
are **+** links beside the first and last name, not boxes. The browser
fills in names only on the member's own entry; a relative's name boxes
turn autocomplete off, or every relative is offered the member's own name
(Step 61).

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
- A count that leads somewhere other than the button it sits by is a button
  of its own beside it, never inside it (a control can't hold another): the
  red count next to **account** opens what's waiting in the admin consoles
  you run, while **account** still opens the account page. Its label says
  what it counts ("3 need attention in admin").
- A node's details sheet (a person's or a companion's) never covers the
  header's buttons. From `sm` up the header moves aside and lays out to the
  left of the 24rem sheet, the wordmark giving way to the mark where that's
  tight; on a phone the sheet starts under the header. Mark any new sheet
  that sits beside the canvas `data-docked-sheet` to get the same
  (`app/globals.css`).
- A person's details sheet can be minimized (Step 49), on a phone or a
  wide screen: it folds into a card at the foot of the canvas that shows
  whose details are open (photo or initials, name, the sheet's own
  subtitle), in place of the "…'s tree" pill, and their tree gets the
  whole canvas. Pressing the card brings the sheet back as it was; its ✕
  closes the details. It stays minimized while the reader opens other
  people, until nobody is open.
- A person's details sheet keeps its edit button in its header, under the
  name and badges (Step 62): **Edit entry**, or **Fill in what's missing**
  for a Leaf who may only fill blanks, so it's found without scrolling.
  **Manage**, at the foot, keeps the rest (reposition the photo, claim,
  delete) and isn't shown when it holds nothing for the viewer.
- A long form's buttons float, so they're in reach wherever someone is in
  it (Step 59; the edit entry page's **Save changes** and **Back to
  tree**): from `lg` up in a column just right of the form, level with the
  page title; below that in a bar along the bottom of the screen, styled
  like the header. The primary button comes first, as in any row of
  buttons. A failed save's message sits by them. They stay at the end of
  the form in the page's order, so the keyboard reaches them after the
  fields (`components/floating-form-actions.tsx`).
- While a page loads it shows its own shape (Step 61): the same column
  and layout, grey where its content will go
  (`components/page-skeletons.tsx`), so a click answers at once and
  nothing jumps when the page arrives. A page under another route gets its
  own rather than borrowing its parent's (`/tree/review`, `/trees/new`).
- The header streams in on its own: until its buttons are known it's the
  same bar with only the mark (`SiteHeaderShell`), so no page waits for it
  and nothing moves when it arrives.
- A page that fails says **Something Went Wrong**, with **Try again** and
  **Back to tree**, the header kept; a missing one says **Page Not Found**,
  with **Back to tree** (Step 61).

## Feedback

What a button shows while it works, where a failure goes, and what's asked
before something is lost (Step 70). The pieces are shared; a new screen
uses them rather than its own flags and messages.

- **A server action is called through `useAction`**
  (`components/use-action.ts`), or a button built on it: `ActionButton`
  for one button and one action, `ConfirmButton` for one that asks first,
  `SubmitButton` in a `<form action>`. Only the pressed button shows it's
  busy, with a spinner and its own words ("Deleting…"); the others that
  would clash are disabled but keep their labels. It stays busy until the
  page has redrawn, or the next page has arrived, so a second press can't
  save twice, and it ends however the call went: a failure never leaves a
  button stuck. A busy button keeps keyboard focus.
- **A failure shows where the reader is looking.** A form's or a dialog's
  goes by its button (`FormError`, `role="alert"`) and stays until they
  try again. A toast is for a button with no form around it, and for what
  happens off screen: an email sent, a link copied, a change someone else
  will see. A toast never repeats what the screen already shows ("Comment
  posted." under the comment).
- **Toasts** are red for a failure and green for a success, and can be
  closed; a failure stays up 10 seconds. On a phone they come in at the
  top, under the header, where they cover none of the canvas's buttons;
  wider, at the bottom right, left of a docked details sheet.
- **Ask before a loss**, in a dialog that needs an answer (`ConfirmDialog`,
  Base UI's AlertDialog): its title is the question naming the thing
  ("Remove Jane from The Sayanis?"), then only what the reader must know
  first. **This cannot be undone.** sits on a line of its own, and only
  where something is really lost. The safe button comes first and has
  focus; the one that does it is solid red, labelled with the verb, and
  the only solid red button anywhere. A change that can't be reversed but
  loses nothing (making someone a Root) asks the same way with a plain
  confirm. A failure shows inside the dialog, which stays open. Nothing
  asks before an ordinary decision (Approve, Decline, Dismiss).
- **Cheap to put back, no question:** unlinking a person from a companion,
  a name from a nickname group, or dismissing a declined suggestion from its
  card (Step 74) happens at once, with **Undo** in the toast.
- **Red:** the tinted `destructive` button is for a removal among other
  buttons (a row's **Delete**); `destructive-solid` only confirms. A count
  asking for attention (the header's admin count) is `attention`, and a
  button that sends something (**Send dispute**) is an ordinary one.
- **Row buttons say which row**: a list's **Delete**, **Remove**, **Copy**
  or **Download** names its row to a screen reader ("Remove Will.pdf").
- **A switch moves when it's pressed**, before the server answers, and
  goes back by itself if the change fails (`useOptimistic`); a removed row
  leaves the list at once and returns to its place if it fails.
- **Focus never drops to the page** when the control that had it goes
  (`components/use-focus-return.ts`): opening an inline form focuses its
  first field, closing it returns to the button that opened it, and when a
  row is removed the next row's first button takes focus.
- **Touch targets:** on a touch screen a small control (a bare ✕, a text
  link used as a button, the header's buttons, a sheet's or dialog's
  close) answers to a 44 px square around it (`relative tap-target`, an
  invisible hit area, so nothing moves), and the canvas's zoom buttons are
  40 px. A bare ✕ is `text-muted-foreground` at full strength, never faded
  under 3:1.

## Charts

The first is the dashboard's members active each week (Step 56,
`components/dashboard/weekly-active-chart.tsx`).

- One series wears `--chart-1`, a blue nothing else here means. Its light
  and dark steps are the data-viz reference palette's first slot (#2a78d6,
  #3987e5), and each clears 3:1 on the card. A second series takes the next
  slot of that palette, run through its validator first; never an account
  type's colour, `--canopy` or `--destructive`, which already mean something.
- A single series has no legend: the card's title names it.
- Columns are at most 24px wide with 4px rounded tops, rising from one
  baseline. Gridlines are solid hairlines in `--border`, a whole round step
  apart (`lib/dashboard.ts#countAxis`), labelled on the left.
- Only the newest column carries its number. Hovering or focusing a column
  shows its week and count, and a table under the chart (**Show the
  numbers**) has every value, so nothing needs a hover.
- On a phone, labels under the columns thin to every other one, counted
  back from the newest; each stays centred on its column.
- A share of something (how many members have done each thing) is a bar
  in `--chart-1` on a track of the same blue at 15%, with the count beside
  it in words ("8 of 9").
- Figures in a table are `tabular-nums` and right-aligned; a headline number
  on its own isn't.

## Step-by-step flows

- A flow of steps (the founder's first run, Step 29) shows where you are
  as a numbered list at the top: the current step named, done steps
  ticked, and every other step a link once it can open. On a phone only
  the current step keeps its name.
- Each step has its own address (`?step=`), so a refresh or a save that
  refreshes the page stays on it.
- Its buttons — **Continue**, **Skip for now**, **Save and continue** —
  finish a step rather than move between views, so they're sentence case
  like any other action. Everything but the one step the flow can't do
  without can be skipped, and whatever's left is offered again where the
  flow ends (the canvas's **Getting Started** list).
- A list like that, laid over the canvas, starts collapsed to its header
  on a phone (below `sm`), so it never covers the top of the tree, and open
  anywhere wider.
- A first run that asks someone to fill in an entry a relative made (the
  welcome, Step 50) is one page, not steps. It shows the entry as it stands
  at the top, as a line under their name with **Change** to open every
  field, and asks below it only for a photo and what's empty. A middle,
  preferred or maiden name is offered as a link, never counted as missing. Its
  buttons are **Save and see the tree** and **Skip for now**.
