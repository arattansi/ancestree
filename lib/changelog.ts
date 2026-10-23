/**
 * The public changelog at /changelog (Step 191): what shipped, dated, so a
 * visitor (and a crawler) can see ancestree is alive and moving. Newest
 * first. Only what a member or visitor can see goes here, in plain words:
 * no admin tools, no iPhone app until it's in the App Store, no step
 * numbers on the page (`steps` is for us, to find the build log's entry).
 *
 * Keep it going: a step that changes what people see adds an entry at the
 * top, dated the day it went live on main (ANCESTREE.md → Conventions).
 */
export type ChangelogEntry = {
  /** The day it went live, `YYYY-MM-DD`. */
  date: string;
  title: string;
  items: string[];
  /** The build steps it covers, from ANCESTREE.md's changelog. */
  steps: number[];
};

export const CHANGELOG: ChangelogEntry[] = [
  {
    date: "2026-10-22",
    title: "join without an email",
    items: [
      "family who don't use email, on wechat say, can join from a claim link or the family link with just their name.",
      "to sign back in, a root of their tree makes them a sign-in link to send in any chat, or to scan. it works once, for 24 hours.",
    ],
    steps: [202],
  },
  {
    date: "2026-10-21",
    title: "ancestree for android",
    items: [
      "an ancestree app for android phones: download it from ancestree.space/android. it comes from us, not google play.",
    ],
    steps: [198, 200],
  },
  {
    date: "2026-10-19",
    title: "privacy, on who we are",
    items: [
      "the about-us page now ends on how much we care about privacy and security, with a link to the privacy page.",
    ],
    steps: [195],
  },
  {
    date: "2026-10-19",
    title: "children's privacy, up front",
    items: [
      "the privacy page now says early on how we look after children: nobody but a parent adds a child under 18, and the family sees only what their parent chooses.",
    ],
    steps: [194],
  },
  {
    date: "2026-10-19",
    title: "a shorter sign-in code",
    items: ["the code we email you to sign in is 6 digits now, not 8."],
    steps: [193],
  },
  {
    date: "2026-10-19",
    title: "the new line in our emails",
    items: [
      "every email from ancestree now says \"the family tree you grow together.\" under the name, as the home page does.",
    ],
    steps: [192],
  },
  {
    date: "2026-10-18",
    title: "a changelog",
    items: ["this page: every update to ancestree, dated, newest first."],
    steps: [191],
  },
  {
    date: "2026-10-18",
    title: "the unread badge clears",
    items: [
      "once you've read a conversation and replied, its unread badge goes.",
    ],
    steps: [190],
  },
  {
    date: "2026-10-18",
    title: "privacy + security on what + how",
    items: [
      "/features says how your tree and messages are kept private.",
      "new words across the site, and a new line under the name on the home page.",
    ],
    steps: [188],
  },
  {
    date: "2026-10-17",
    title: "a story about several people",
    items: [
      "a story can be about more than one person.",
      "it shows on each person's details once they say yes.",
    ],
    steps: [183],
  },
  {
    date: "2026-10-16",
    title: "messages between relatives",
    items: [
      "message anyone on your tree from the header, beside the bell.",
      "each message is encrypted on your device before it's sent.",
      "a message to a relative who hasn't set up messages yet waits until they have.",
      "mute a conversation, delete your own message, block or report someone, export what's yours.",
      "the weekly newsletter names who you have unread messages from.",
    ],
    steps: [174, 177, 180, 181, 182],
  },
  {
    date: "2026-10-16",
    title: "joining a tree, and invites that last",
    items: [
      "invites stay open 30 days, with a reminder on day 5 and day 25.",
      "an expired invite can ask for a fresh one.",
      "invite the people you just added, right after adding them.",
      "Roots hear who joined, and can make them a Branch.",
      "members who join get a short getting started of their own.",
    ],
    steps: [162, 163, 170, 171],
  },
  {
    date: "2026-10-16",
    title: "a first tree that names itself",
    items: [
      "your tree takes your family name as you add yourself.",
      "the first run ends on your own leaves, with a card to invite family.",
    ],
    steps: [168, 169],
  },
  {
    date: "2026-10-15",
    title: "starting a tree in one step",
    items: [
      "a new address that signs in can start a tree straight away, no second code.",
      "the first run opens on your family, with you in the middle and a short form.",
      "the sign-in code box survives a reload.",
    ],
    steps: [160, 161, 164, 165],
  },
  {
    date: "2026-10-15",
    title: "lives in, and tighter privacy",
    items: [
      "an optional lives in for living relatives, seen only by members.",
      "visitors to a tree see entries only as cards.",
      "an email address you haven't shown stays yours alone.",
    ],
    steps: [153, 155, 156],
  },
  {
    date: "2026-10-15",
    title: "the library: likes, shares and stories sent in",
    items: [
      "like and share a post, and find your way back to the library.",
      "send in a story of your own for the library.",
    ],
    steps: [157, 158],
  },
  {
    date: "2026-10-13",
    title: "getting started emails",
    items: [
      "a few short emails to help you claim your entry, invite family, add relatives and write a story.",
      "they have their own off switch.",
    ],
    steps: [151],
  },
  {
    date: "2026-10-12",
    title: "one + for relatives, photos and stories",
    items: [
      "one + button adds a relative, photos or a story.",
      "change the date a photo was taken.",
      "the newsletter says what the people added are to you, and links to new stories.",
      "invite family straight from the newsletter.",
    ],
    steps: [143, 144, 145, 146],
  },
  {
    date: "2026-10-07",
    title: "the library",
    items: [
      "/library holds stories of our wise: the people our families came from.",
      "follow it by email or RSS.",
    ],
    steps: [134, 135, 138],
  },
  {
    date: "2026-10-05",
    title: "trees open on you",
    items: [
      "joining a tree lands on My Family Tree.",
      "a tree opens centred on you, and closing a spotlight keeps your zoom.",
      "the menu is drawn as a tree.",
    ],
    steps: [131, 133],
  },
  {
    date: "2026-10-03",
    title: "anyone can start a tree",
    items: [
      "no waitlist: anyone can start their family's tree.",
      "add a story by writing it or recording it.",
      "add many photos at once, then edit who's in each and its description.",
      "a written story tags the people it mentions.",
      "siblings can be added before their parents.",
    ],
    steps: [113, 114, 116, 117, 119, 125, 126],
  },
  {
    date: "2026-10-02",
    title: "a site of our own",
    items: [
      "why, what + how, who and capitalism: pages on what ancestree is and isn't.",
      "a demo on /features where a form grows leaves.",
      "am i on a tree? finds your family's tree before you join it.",
    ],
    steps: [107, 110, 111, 112],
  },
  {
    date: "2026-10-01",
    title: "My Family Tree and the weekly newsletter",
    items: [
      "My Family Tree: your own family, across all your trees. blood relatives as leaves, who married in as pills.",
      "a weekly email with what was added to your family and what's coming up.",
      "stories in Markdown, with storyteller and interviewer credits and the date told.",
      "only a parent adds a child under 18.",
      "your card on another tree can be cut back to your name alone.",
      "moving around the tree is smoother.",
    ],
    steps: [92, 94, 95, 97, 98, 99, 100, 101, 104, 105, 106],
  },
  {
    date: "2026-09-30",
    title: "a person's details, redone",
    items: [
      "each person's details hold their stories, with links and comments, and an album with tags and dates.",
    ],
    steps: [88],
  },
  {
    date: "2026-09-29",
    title: "carry a family line",
    items: [
      "carry all the descendants of someone to another tree; full details follow once their owners say yes.",
      "mark a date of birth or death as circa.",
      "a place of birth can be just a country.",
      "Roots can invite someone to claim any entry their tree shows.",
      "share the week's birthdays and anniversaries to WhatsApp, Messages or anywhere.",
    ],
    steps: [79, 80, 81, 83, 84, 89],
  },
  {
    date: "2026-09-28",
    title: "suggest a change",
    items: [
      "can't edit an entry? suggest a change, for its owner and Roots to accept.",
      "whoever declines can say why, and you can edit and resend.",
      "add a missing place right from the place search, which now finds more.",
    ],
    steps: [64, 66, 67, 68, 69, 71, 72, 73, 74],
  },
  {
    date: "2026-09-27",
    title: "birthdays without the year",
    items: [
      "a birthday or wedding anniversary can be a day and month alone.",
      "shorter entry forms.",
    ],
    steps: [58, 63],
  },
  {
    date: "2026-09-25",
    title: "sign in with a code",
    items: [
      "sign in with a code sent by email, no link to click.",
      "a Root's family link lets relatives join without a personal invite.",
      "an emailed invite joins only the address it was sent to.",
      "claiming your entry welcomes you and asks for your details.",
    ],
    steps: [50, 51, 52, 53],
  },
  {
    date: "2026-09-24",
    title: "better on phones",
    items: [
      "cards stay put on touch screens, and details minimize to a card.",
      "go to me, and a filter for your Root's side of the tree.",
    ],
    steps: [48, 49],
  },
  {
    date: "2026-09-23",
    title: "ancestral lands",
    items: [
      "a place of birth shows its ancestral lands, from Native Land Digital.",
      "Leaves can fill in what's missing on an entry.",
    ],
    steps: [40, 44],
  },
  {
    date: "2026-09-22",
    title: "more than one tree",
    items: [
      "one person can be on several trees, and keeps control of their own entry.",
      "Root, Branch and Leaf accounts: who tends the tree, who tends a side, who keeps their own entry.",
      "a walkthrough for founding your first tree.",
    ],
    steps: [25, 29, 34],
  },
  {
    date: "2026-09-21",
    title: "search, filters and connections",
    items: [
      "find a person, and show how any two people are connected.",
      "pets and companions are hidden until you turn them on.",
    ],
    steps: [23],
  },
  {
    date: "2026-09-18",
    title: "our own mark, and dates you half know",
    items: [
      "the ancestree mark, drawn by hand.",
      "a birth or death date can be just a year, or a month and year.",
      "Branches can edit their own side of the tree.",
    ],
    steps: [17],
  },
  {
    date: "2026-09-08",
    title: "smarter connection suggestions",
    items: [
      "suggested connections reason about the tree, not matching surnames.",
      "add a child and their parent's partner is offered as a second parent.",
    ],
    steps: [],
  },
  {
    date: "2026-09-03",
    title: "pets and companions",
    items: ["add pets to the tree as companions, with birthdays of their own."],
    steps: [],
  },
  {
    date: "2026-09-02",
    title: "the tree on a phone",
    items: ["the family tree works on a phone."],
    steps: [],
  },
  {
    date: "2026-09-01",
    title: "find yourself first",
    items: [
      "look for yourself on the tree before adding yourself, nicknames included.",
      "crop and reframe photos.",
    ],
    steps: [15],
  },
  {
    date: "2026-08-31",
    title: "share links and bloodlines",
    items: [
      "share a view-only link to your family tree.",
      "click a line to light up a whole bloodline.",
      "places keep the names they had at the time.",
    ],
    steps: [],
  },
  {
    date: "2026-08-30",
    title: "ancestree begins",
    items: [
      "invite family by email, and grow the tree together.",
      "claim your own entry, comment on entries, and hear about changes.",
      "marriages and divorces, and places from a world gazetteer.",
    ],
    steps: [3, 4, 5, 6, 7, 8, 9, 10, 11],
  },
];

/** An entry's anchor on the page: its date and title, `2026-10-18-a-changelog`. */
export function changelogId(entry: ChangelogEntry): string {
  const slug = entry.title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${entry.date}-${slug}`;
}

/** The day the newest entry went live, for the sitemap and the feed. */
export function changelogUpdated(): string {
  return CHANGELOG[0].date;
}

export function changelogHref(): string {
  return "/changelog";
}
