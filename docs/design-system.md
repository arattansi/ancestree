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
the `h1` of a page. A table of contents that points at sections (the Root
console's side nav) repeats their titles, so it uses the same case.

Descriptions, labels, hints and body copy stay in sentence case. Buttons
don't: they're all lower-case (below).

### Buttons: lower-case

Every button is lower-case (Step 102; navigation only since Step 30.4),
and only buttons: what's drawn as one, filled, outlined, tinted or ghost.
That's the header's **admin** (a beta reviewer's, red: Step 103),
**tree**, **connections**, **account**, **sign in** and **sign out**; the
account page's views **profile**, **root**, **settings**; the admin
page's tabs **newsletter**, **analytics**, **manage**; the home page's **view your tree**,
**join a tree**, **start a tree (beta)**; and every button that does
something: **save**, **rename**, **delete**, **continue**, **skip for
now**, **add a relative**, **auto-arrange**, **ask to join**. That covers,
alike:

- what a button says while it works: **saving…**, **deleting…**;
- a dialog's buttons, **cancel** and its confirm (**delete**, **yes,
  merge**), though its title stays Title Case or a question;
- the sheet header's **edit**, **fill in** and **suggest** tags, and a
  row of bordered choices (**anyone** / **living** / **deceased**);
- a toast's action (**undo**, **copy**);
- an email's button: **open my family tree**, **review the request**,
  **join ancestree**.

Names keep their capitals: a person's or a tree's, which a button shows
as it is (**invite as Amarshi Sayani**, **open The Sayanis**, the tree
switcher showing a tree's name), and other products' (**WhatsApp**,
**download JSON export**, **upload a Markdown file**). Our own names
don't: the switcher says **my family tree** and **your trees**, a Root
confirms **make a root**, and a notification offers **view in root
console**.

Not buttons, so sentence case: anything drawn as a link, even a
`<button>` or `variant="link"` (**Edit**, **Delete**, **Try again**,
**Read more**, **+ Middle name**, **Use another email**, the account
page's **Root console**), though the dialog it opens has lower-case
buttons; a section heading that opens and closes (**Getting Started**,
**Family**, **Show the numbers**), which is a title; a card, a picker's
row, a search's options or a photo that is pressed; radio choices
(**Light** / **Dark** / **System**); a menu's items, a select's value, a
badge, a field's label and an icon-only button's name (**Report a
problem**).

Write the words lower-case in the source rather than with CSS
(`text-transform`), so a screen reader, a copy and a search see what the
button shows. `lib/button-case.test.ts` fails on a capital in any
button's words, and passes over what's drawn as a link (`variant="link"`
or an underlined class); a new product name goes in its list.

### Root, never admin

A member reads **Root**, never "admin" (Step 75): labels, toasts, errors,
emails and the database's own messages alike. What a Root runs is the
**Root console**, and its view toggle is **root**, lower-case like the
other views. `admin` stays in code and in addresses (`/account?view=admin`,
`/account/admin`), so links in emails already sent keep working.

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

- Pages sit in a centred column: `3xl` for the account page and Root
  console, `2xl` for forms, `lg` for short pages (`PageColumn` in
  `components/page-column.tsx`, whose widths these are), `max-w-5xl` for
  the header. A page with one thing in the middle of it, a card or a
  message, is a `CenteredPage`.
- A list of things to act on is a `RowList` of `RowCard`s
  (`components/row-card.tsx`): bordered cards whose lines stack, 12 px
  apart, or `dense` one-line rows 8 px apart, and one muted line when
  there's nothing in it. An entry a name matches is a `CandidateRow`.
- Settings-style pages lay cards out in two columns (`grid gap-6
  md:grid-cols-2`); a card that needs the width spans both
  (`md:col-span-2`). Cards keep their natural height; don't stretch one to
  match its neighbour, trim its copy instead. The one exception: the Root
  console's **Overview** and **Settings**, a pair at its top, are the same
  height (Aalim, Step 109).
- A long page of cards (the Root console; settings since Step 108) has a
  floating side nav at `xl` and up (`AdminSideNav`): a thin ruled column
  left of the content, one label per section repeating its title, the one
  in view marked. A card the nav points into opens itself if it's folded.
- A card that's long and rarely needed folds to its title
  (`CollapsibleCard`, settings' **Notifications**, Step 108): a chevron
  beside the title, closed at first, its action (**clear**) at the right
  only while open. A `#hash` naming it or something in it opens it on
  load (the newsletter email's `#newsletter`).
- The header is three columns: the mark, the tree switcher centred (for
  every member since Step 92.2: **My Family Tree** first, then each tree
  with the mark of their account type there, then starting a tree of their
  own until they've founded one — **Ask to start a tree**, **Asked to start
  a tree**, **Start a tree**), and the navigation buttons right-aligned.
  Members land on My Family Tree every visit (Step 92.5). The mark opens
  the home page for everyone (Step 107; for a member, My Family Tree
  until then), and **tree** opens
  the canvas they're on, or from another page the tree they switched to
  this visit — with none chosen, My Family Tree too, lit there. A tree
  picked from My Family Tree is always switched to, even the one shown
  by default, so the choice holds until two hours pass without a visit. The switcher
  names a tree only on its canvas (`/tree`) and says **my family tree**
  everywhere else, for a member with an entry of their own, even after a
  tree is picked. It stays one row from 320px up (Step 85.2): the
  buttons never wrap and a long tree name ends in "…". On a narrow bar, a
  phone's or one beside a docked sheet below 64rem, it goes compact: the
  mark without the wordmark, **tree**, **connections** and **account** as
  their symbols (their words still name them), and the counts on the
  buttons' corners.
- A count that leads somewhere other than the button it sits by is a button
  of its own beside it, never inside it (a control can't hold another): the
  red count next to **account** opens what's waiting in the Root consoles
  you run, while **account** still opens the account page. Its label says
  what it counts ("3 need attention in the Root console").
- A node's details sheet (a person's or a companion's) never covers the
  header's buttons. From 44rem up the header moves aside and lays out to
  the left of the 24rem sheet, compact where that's tight; narrower, the
  sheet starts under the header (Step 85.2). Mark any new sheet
  that sits beside the canvas `data-docked-sheet` to get the same
  (`app/globals.css`).
- A person's details sheet can be minimized (Step 49), on a phone or a
  wide screen: it folds into a card at the foot of the canvas that shows
  whose details are open (photo or initials, name, the sheet's own
  subtitle), in place of the "…'s tree" pill, and their tree gets the
  whole canvas. Pressing the card brings the sheet back as it was; its ✕
  closes the details. It stays minimized while the reader opens other
  people, until nobody is open.
- A person's details sheet keeps its edit button in its header (Step 62),
  so it's found without scrolling: at the right end of the badges' row,
  drawn like the account type tag and its size (Step 88.1). **edit**, or
  **fill in** for a Leaf who may only fill blanks, and **suggest** for
  anyone who can't edit the entry. **Manage**, at the foot, keeps the rest
  (reposition the photo, claim, delete) and isn't shown when it holds
  nothing for the viewer.
- On My Family Tree (Step 92.3) a person's sheet acts on the card's own
  tree, the one whose mark it wears, as who the reader is there: its
  **edit**, **fill in** and **suggest** open that tree's page for the
  entry, switching to the tree first when the browser is on another (busy
  until it arrives, like **On**'s links), and the page comes back to the
  view. Stories, the album and reports are the sheet's as on a tree; a
  line's dates are changed there only where it was drawn on a tree the
  reader is a Root or a Branch of. Companions only show.
- My Family Tree adds nothing itself, so its **add a relative** asks
  **Which tree do you want to add to?**: the question and the trees, each
  a button with its mark, and nothing else (Step 92.3). From someone
  selected it offers only the trees showing them where the reader may add
  from them; with nobody selected, or nowhere they may add from them,
  every tree, adding without them. With one tree to offer it doesn't ask:
  the button goes straight to that tree's add flow.
- My Family Tree rests as a spotlight does (Step 97): every direct
  relative is a **leaf** on brown branches, laid out as a pulled-out line
  is (`centreFamilies`), and whoever married in a pill. Clicking someone
  lights how they're connected to the reader (Step 97.1), as **Show a
  connection** would: the chain pulled out, everyone else a blurred leaf,
  and under it **You ↔ Nadia Patel** · **First cousins**, whose ✕ closes
  them. Clicked again, the same person shows their own tree, as a click
  does on a tree's canvas (**Nadia Patel's tree** · ancestors ·
  descendants), and once more their connection again (Step 97.2); the
  reader's own leaf shows their own tree at once. The canvas tip there
  says **Tap anyone to see how you're connected, and again for their own
  tree.** A search fades leaves as it fades cards. Where the paragraphs
  below say "card", on My Family Tree it is drawn as a leaf.
- Off a spotlight's line, on any canvas (Step 97.3), nothing answers a
  hover: no card grows, no leaf's card opens, no border lights, no
  tooltip. Whoever the pointer is over is named in a soft pill at the
  bottom right instead (**Sara Zz97 · b. 1987 · Canada**; a companion's
  kind and years), beside the minimap or the open sheet, level with the
  pill naming what's lit, centre to centre, or just above that row when
  the two would touch. Only with a pointer that hovers, from `sm` up.
  Everyone on the lit line keeps their hover card.
- On My Family Tree a leaf (or card) shows no account type (Step 97.3):
  being one tree's Root or Leaf says little across trees. Anyone with an
  account wears the **ancestree mark** in small instead, hung under the
  leaf where the account type would be, beside the tree's mark (a card's
  bottom corner), titled **Ancestree member**: the reader, members' own
  entries and settled claims, and anyone a tree names Root, Branch or
  Leaf. The key lists it last. Pills stay name only.
- On My Family Tree (Step 94) a direct relative is a card and whoever
  married in is a **pill**, the shape a sibling's partner takes in a
  spotlight (Step 19.4): name only, muted, no photo or account mark, on the
  far side of their partner, everywhere on the view, spotlit or not. The
  pill's tooltip says **Married in · Spouse of Karim** (or **Former spouse
  of**, **Co-parent with**, **Your former spouse**). The reader's own
  spouse is the exception (Step 94.1): a card beside them, saying **Your
  spouse** under the name where theirs says **You** (on a leaf too, in
  the same place, Step 97). The difference is
  also said outright: the key under the tree names lists a small card,
  **Direct relative**, and a small pill, **Married in**, and the sheet's
  badges start with **Direct relative**, **Your spouse** or **Married in**
  (none on the reader's own entry).
- On My Family Tree a card that may be one person entered twice (Step
  92.4, `lib/same-person.ts`) wears a **?** in the attention yellow at its
  foot, across from the member mark; on a leaf (Step 97), hung under it
  right of the member mark, as the tree mark hangs left; on a pill, on
  its right shoulder (Step 94). Its
  sheet asks above **On**: **Same person as ● Fatima Rattansi?**, the
  other card's name, with its tree's mark, opening that card, and **not
  the same**, which puts the question away at once, in this browser only,
  with **undo** in its toast. Only the reader sees it; no tree's own
  canvas asks.
- Sections of the sheet that matter less fold away, closed at first, their
  heading the button with a count beside it (Step 88.1:
  **Family** and **Companions**, `components/tree/sheet-fold.tsx`). One
  opened stays open as the reader moves from person to person, until the
  details close. A folded section keeps what was typed in it.
- A long form's buttons float, so they're in reach wherever someone is in
  it (Step 59; the edit entry page's **save changes** and **back to
  tree**): from `lg` up in a column just right of the form, level with the
  page title; below that in a bar along the bottom of the screen, styled
  like the header (both `bar-chrome`, in `app/globals.css`). The primary button comes first, as in any row of
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
  and nothing moves when it arrives. It draws only counts; the bell's list
  is read when it's opened (grey rows until it arrives), and the counts are
  asked for again as someone moves between pages or comes back to the tab
  (Step 77.2).
- A page that fails says **Something Went Wrong**, with **try again** and
  **back to tree**, the header kept; a missing one says **Page Not Found**,
  with **back to tree** (Step 61).

## Feedback

What a button shows while it works, where a failure goes, and what's asked
before something is lost (Step 70). The pieces are shared; a new screen
uses them rather than its own flags and messages.

- **A server action is called through `useAction`**
  (`components/use-action.ts`), or a button built on it: `ActionButton`
  for one button and one action, `ConfirmButton` for one that asks first,
  `SubmitButton` in a `<form action>`. Only the pressed button shows it's
  busy, with a spinner and its own words ("deleting…"); the others that
  would clash are disabled but keep their labels. It stays busy until the
  page has redrawn, or the next page has arrived, so a second press can't
  save twice, and it ends however the call went: a failure never leaves a
  button stuck. A busy button keeps keyboard focus.
- **A failure shows where the reader is looking.** A form's or a dialog's
  goes by its button (`FormError`, `role="alert"`) and stays until they
  try again. A toast is for a button with no form around it, and for what
  happens off screen: an email sent, a link copied, a change someone else
  will see. A toast never repeats what the screen already shows ("Story
  added." under the story).
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
  asks before an ordinary decision (**approve**, **decline**, **dismiss**).
- **Cheap to put back, no question:** unlinking a person from a companion,
  a name from a nickname group, or dismissing a declined suggestion from its
  card (Step 74) happens at once, with **undo** in the toast.
- **Red:** the tinted `destructive` button is for a removal among other
  buttons (a row's **delete**); `destructive-solid` only confirms. A count
  asking for attention (the header's Root console count) is `attention`, and a
  button that sends something (**send**, in the dispute dialog) is an ordinary one.
- **Orange** (`orange`, Step 107) is a way back that should be seen: **try
  a different spelling** when join a tree finds nobody. Dark amber text on
  it, as on `attention`'s yellow, since white on orange falls short of AA.
- **Row buttons say which row**: a list's **delete**, **remove**, **copy**
  or **download** names its row to a screen reader ("Remove Will.pdf").
- **A switch moves when it's pressed**, before the server answers, and
  goes back by itself if the change fails (`useOptimistic`); a removed row
  leaves the list at once and returns to its place if it fails.
- **Focus never drops to the page** when the control that had it goes
  (`components/use-focus-return.ts`): opening an inline form focuses its
  first field, closing it returns to the button that opened it, and when a
  row is removed the next row's first button takes focus.
- **Moving around** (Step 77.3): a link whose page takes a moment pulses
  its label until that page is on its way (`LinkPendingLabel`), and a view
  or step that reads its own data shows its shape at once (its own
  `Suspense`, keyed by it). A way to a page on a tree is a `TreeTarget`: on
  the tree being looked at, a plain link, never fetched ahead; on another,
  a button that switches first and stays busy until the page has arrived.
  The canvas keeps who's open in the address, and its camera and filters
  for the tab, so Back finds it as it was left.
- **Touch targets:** on a touch screen a small control (a bare ✕, a text
  link used as a button, the header's mark, tree switcher and buttons, a
  sheet's or dialog's
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

## Tree marks

My Family Tree (Step 92) gathers a member's trees into one view, so each
card wears a mark for the tree it came from, and a key names them.

- Two hues, the data-viz reference palette's blue and magenta:
  `--tree-mark-1` (#2a78d6 light, #3987e5 dark) and `--tree-mark-2`
  (#d55181 in both). They're the only pair of its hues that means nothing
  else here: not red (a card's report count, delete), orange or brown (Root
  and Branch), yellow (`--attention`), green (leaves, Leaf, `--canopy`).
  Every tree can sit beside every other on a card, so they were checked
  as all pairs, against the card in each theme: 3:1 or more, and apart
  under colour blindness. Adding blue's or magenta's neighbours in that
  palette (violet, aqua) failed in dark.
- A member's trees take marks in the order they joined
  (`lib/my-family.ts#treeMarkOf`): blue, magenta, then the same two as
  rings, so four trees each have their own. Past four the marks repeat.
- A mark never stands alone: the key names every tree, and the details
  sheet names every tree of theirs showing that person.
- Where they sit (Step 92.2): a dot in a card's top corner, across from
  the report count; inside a pill, before the name (Step 94); under a leaf
  beside the member mark (Step 97.3), ringed in card colour like it; the key under
  **Search & filters**, where the lanes' names on the left stay clear; the
  sheet's **On** row, in place of **Also on**, each tree a link to it.

## Marketing pages

Home, **capitalism** (`/pricing`), **why** (`/manifesto`), **what + how**
(`/features`) and **who** (`/about-us`), Step 107, in `app/(marketing)/`.
Their tab titles are lower-case as Aalim wrote them, not Title Case. Each
page's heading is its real name in brackets, not the menu's:
**(about-us)**, **(how to + features)**, **(product manifesto)**, **(pricing)** and
**(privacy + your family's data)**. All but home are left-aligned, in the
privacy page's column (`PageColumn`) and type: `text-2xl` heading,
`text-sm text-muted-foreground` body.

- Behind the home page only, the **Elevators tree**
  (`components/marketing/elevators-tree.tsx`, `lib/elevators-tree.ts`): a
  family drawn as a spotlight draws one, with the canvas's own leaves,
  account marks and branches, faded back. A leaf says how they're related
  (**me**, **you**, **your momma**, **your cousin, too**); hovered, it comes
  forward and its card shows a made-up name, as on the canvas.
- The site's menu is Aalim's handwriting (Step 110,
  `components/site-nav-menu.tsx`): **who**, **what + how**, **why**,
  **capitalism**, **shh**, traced to vectors (`lib/nav-words.ts`, and as
  SVG files in `public/brand/nav/` for anything else). Closed, the five
  words lie on top of one another in the header, the size of
  "ancestree" beside them: in the bar's top-left corner from 1240px,
  just before the mark below that. Pressed, each word flies out of the
  pile, a beat after the one before, and grows into its place in a list
  down the left of the page, each word across where Aalim drew it and
  the five evenly spaced, the page you're on boxed in a square (a 2px
  outline in the word's ink); a × takes the pile's
  place. It folds back the same way for the ×, Esc, a press outside or a
  page chosen. Below `xl` the page washes back behind the list. On the
  home page and the marketing pages it stays open from 1240px (no ×, no
  wash; the words fly out once the page loads, and back into the pile on
  leaving for the app); narrower, those pages work as the app does. In
  `currentColor`, so it's black or white with the theme; with reduced
  motion it opens and closes without the flight.
- A page's words go in the gap between the parents and **me** and
  **you**, which sits in the middle of the page; the page's `main` lets
  the pointer through to the leaves wherever it draws nothing. On a phone,
  too narrow for the family, me and you stay in the middle and the rest
  crops off the sides.

## Step-by-step flows

- A flow of steps (the founder's first run, Step 29) shows where you are
  as a numbered list at the top: the current step named, done steps
  ticked, and every other step a link once it can open. On a phone only
  the current step keeps its name.
- Each step has its own address (`?step=`), so a refresh or a save that
  refreshes the page stays on it.
- Its buttons — **continue**, **skip for now**, **save and continue** —
  are lower-case like every button. Everything but the one step the flow
  can't do without can be skipped, and whatever's left is offered again
  where the flow ends (the canvas's **Getting Started** list).
- A list like that, laid over the canvas, starts collapsed to its header
  on a phone (below `sm`), so it never covers the top of the tree, and open
  anywhere wider.
- A first run that asks someone to fill in an entry a relative made (the
  welcome, Step 50) is one page, not steps. It shows the entry as it stands
  at the top, as a line under their name with **Change** to open every
  field, and asks below it only for a photo and what's empty. A middle,
  preferred or maiden name is offered as a link, never counted as missing. Its
  buttons are **save and see the tree** and **skip for now**.
