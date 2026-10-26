import { formatPartialDate } from "@/lib/partial-date";
import { creditGroups, type StoryCredit } from "@/lib/story-credits";

/**
 * A member's own data, to take with them (Step 207): the settings view's
 * **export data** saves their profile as a .csv, or what they're tagged in
 * as a .zip. These are the pure parts; `data-export.server.ts` reads.
 */

// ---------------------------------------------------------------------------
// CSV
// ---------------------------------------------------------------------------

/**
 * One cell as RFC 4180 writes it: quoted when it holds a comma, a quote or
 * a line break. A cell a spreadsheet would run as a formula (`=`, `+`, `-`,
 * `@`, a tab or a return first) gets a `'` before it: relatives type the
 * names in it, and opening the file shouldn't run what they typed.
 */
export function csvCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * The rows as a .csv: CRLF line ends, and a byte-order mark first, without
 * which Excel reads "née" as "nÃ©e".
 */
export function toCsv(rows: string[][]): string {
  return `﻿${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`;
}

// ---------------------------------------------------------------------------
// Profile data (.csv)
// ---------------------------------------------------------------------------

export type FamilyRelation =
  | "Parent"
  | "Partner"
  | "Former partner"
  | "Child"
  | "Sibling";

/** Everything "download profile data" lists, as read for the member. */
export type ProfileExport = {
  account: {
    name: string | null;
    /** As settings shows it: "No email" for an account without one (Step 202). */
    email: string;
    memberSince: string;
  };
  settings: {
    newsletter: boolean;
    gettingStarted: boolean;
    /** Null for an account without an email, which has no such switch. */
    relativesCanAsk: boolean | null;
  };
  trees: { name: string; type: string; joinedAt: string; founded: boolean }[];
  /** Their own entry, the same details their card shows; null with none yet. */
  entry: {
    homeTree: string | null;
    firstName: string | null;
    middleName: string | null;
    preferredName: string | null;
    maidenName: string | null;
    lastName: string | null;
    sex: string | null;
    born: string | null;
    birthplace: string | null;
    livesIn: string | null;
    died: boolean;
    deathDate: string | null;
    deathPlace: string | null;
    email: string | null;
    emailShown: boolean;
    hiddenFromVisitors: boolean;
    hasPhoto: boolean;
  } | null;
  /** Everyone a line away from their entry, as the trees name them. */
  family: { relation: FamilyRelation; name: string }[];
};

const onOff = (on: boolean) => (on ? "On" : "Off");
const yesNo = (yes: boolean) => (yes ? "Yes" : "No");

/** "26 October 2026" for a timestamp's day. */
export function dayOf(timestamp: string): string {
  return formatPartialDate(timestamp.slice(0, 10), "day") ?? timestamp;
}

/**
 * The profile as rows under one header, `Section, Field, Value`: a long
 * list rather than one wide row, so a tree or a relative more is a row
 * more, and it reads top to bottom in a spreadsheet. Empty details are
 * left out.
 */
export function profileCsvRows(data: ProfileExport): string[][] {
  const rows: string[][] = [["Section", "Field", "Value"]];
  const add = (section: string, field: string, value: string | null | undefined) => {
    const text = value?.trim();
    if (text) rows.push([section, field, text]);
  };

  add("Account", "Name", data.account.name);
  add("Account", "Email", data.account.email);
  add("Account", "Member since", dayOf(data.account.memberSince));

  add("Settings", "Weekly newsletter", onOff(data.settings.newsletter));
  add("Settings", "Getting started emails", onOff(data.settings.gettingStarted));
  if (data.settings.relativesCanAsk !== null) {
    add(
      "Settings",
      "Relatives can ask me to invite them",
      onOff(data.settings.relativesCanAsk),
    );
  }

  for (const t of data.trees) {
    add(
      "Trees",
      t.name,
      `${t.type}, ${t.founded ? "founded" : "joined"} ${dayOf(t.joinedAt)}`,
    );
  }

  const e = data.entry;
  if (e) {
    add("Your entry", "Home tree", e.homeTree);
    add("Your entry", "First name", e.firstName);
    add("Your entry", "Middle name", e.middleName);
    add("Your entry", "Preferred name", e.preferredName);
    add("Your entry", "Maiden name", e.maidenName);
    add("Your entry", "Last name", e.lastName);
    add("Your entry", "Sex", e.sex);
    add("Your entry", "Date of birth", e.born);
    add("Your entry", "Place of birth", e.birthplace);
    add("Your entry", "Lives in", e.livesIn);
    if (e.died) {
      add("Your entry", "Has died", "Yes");
      add("Your entry", "Date of death", e.deathDate);
      add("Your entry", "Place of death", e.deathPlace);
    }
    add("Your entry", "Email", e.email);
    if (e.email) {
      add(
        "Your entry",
        "Show this email to other members of the tree",
        yesNo(e.emailShown),
      );
    }
    add("Your entry", "Hidden from visitors", yesNo(e.hiddenFromVisitors));
    add("Your entry", "Photo", e.hasPhoto ? "Yes (in the tagged media .zip)" : "No");
  }

  for (const f of data.family) add("Your family", f.relation, f.name);
  return rows;
}

// ---------------------------------------------------------------------------
// Tagged media (.zip)
// ---------------------------------------------------------------------------

/**
 * A date for the front of a file's name, as much as is known: "1987-05-03",
 * "1987-05" or "1987", so the files sort by when; null with none.
 */
export function dateStem(
  iso: string | null | undefined,
  precision: string | null | undefined,
): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  const [, year, month, day] = match;
  if (precision === "year") return year!;
  if (precision === "month") return `${year}-${month}`;
  return `${year}-${month}-${day}`;
}

/**
 * Words made safe for a file's name on every system: no slashes, colons or
 * the other characters Windows refuses, no line breaks, no dot to start
 * (a hidden file) or end, and short enough to read.
 */
export function safeFileStem(text: string, max = 60): string {
  const cleaned = text
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, "");
  if (cleaned.length <= max) return cleaned;
  const cut = cleaned.slice(0, max);
  const space = cut.lastIndexOf(" ");
  return (space > max / 2 ? cut.slice(0, space) : cut).replace(/[.\s]+$/, "");
}

/** A storage path's extension, lower-case, or `fallback` when it has none. */
export function extensionOf(path: string, fallback: string): string {
  const match = /\.([a-z0-9]{1,5})$/i.exec(path);
  return match ? match[1]!.toLowerCase() : fallback;
}

/**
 * Names files in an archive, each once: a second "1987 Wedding.jpg" in a
 * folder becomes "1987 Wedding (2).jpg". Compared without case, as macOS
 * and Windows do, so unzipping never overwrites one with another.
 */
export function fileNamer(): (
  folder: string,
  parts: (string | null | undefined)[],
  fallback: string,
  extension: string,
) => string {
  const taken = new Set<string>();
  return (folder, parts, fallback, extension) => {
    const stem =
      safeFileStem(parts.filter((p) => p && p.trim()).join(" ")) || fallback;
    for (let n = 1; ; n++) {
      const name = `${folder}/${n === 1 ? stem : `${stem} (${n})`}.${extension}`;
      if (!taken.has(name.toLowerCase())) {
        taken.add(name.toLowerCase());
        return name;
      }
    }
  };
}

/** A written story, as the .md file the archive keeps it in. */
export type StoryForExport = {
  title: string | null;
  body: string;
  toldBy: string;
  toldOn: string | null;
  toldPrecision: string | null;
  createdAt: string;
  credits: StoryCredit[];
  about: string[];
};

/**
 * A written story as Markdown, as it's kept (Step 99): its title, who it's
 * about, who added it and when, when it was told and who it's credited to,
 * then its words as written.
 */
export function storyMarkdown(story: StoryForExport): string {
  const lines = [`# ${story.title?.trim() || "A story"}`, ""];
  if (story.about.length) lines.push(`About: ${story.about.join(", ")}  `);
  lines.push(`Added by ${story.toldBy}, ${dayOf(story.createdAt)}  `);
  const told = formatPartialDate(story.toldOn, story.toldPrecision);
  if (told) lines.push(`Told ${told}  `);
  for (const g of creditGroups(story.credits)) {
    lines.push(`${g.label}: ${g.people.map((p) => p.name).join(", ")}  `);
  }
  // The last line's two-space break would hang over the rule.
  lines[lines.length - 1] = lines[lines.length - 1]!.trimEnd();
  lines.push("", "---", "", story.body.trim(), "");
  return lines.join("\n");
}
