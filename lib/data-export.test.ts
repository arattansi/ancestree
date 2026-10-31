import { describe, expect, it } from "vitest";

import {
  cardMarkdown,
  csvCell,
  dateStem,
  extensionOf,
  fileNamer,
  profileCsvRows,
  safeFileStem,
  storyMarkdown,
  toCsv,
  type ProfileExport,
} from "@/lib/data-export";

describe("csvCell", () => {
  it("quotes only what needs it", () => {
    expect(csvCell("Rumi Baldwin")).toBe("Rumi Baldwin");
    expect(csvCell("Vancouver, Canada")).toBe('"Vancouver, Canada"');
    expect(csvCell('Amina "Mina" Lalani')).toBe('"Amina ""Mina"" Lalani"');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
  });

  it("never hands a spreadsheet a formula", () => {
    expect(csvCell("=HYPERLINK(\"x\")")).toBe("\"'=HYPERLINK(\"\"x\"\")\"");
    expect(csvCell("+1 604")).toBe("'+1 604");
    expect(csvCell("-")).toBe("'-");
    expect(csvCell("@me")).toBe("'@me");
  });
});

describe("toCsv", () => {
  it("starts with a byte-order mark and ends each row with CRLF", () => {
    expect(toCsv([["a", "b"], ["née", "c, d"]])).toBe('﻿a,b\r\nnée,"c, d"\r\n');
  });
});

const PROFILE: ProfileExport = {
  account: {
    name: "Rumi",
    email: "rumi@example.com",
    memberSince: "2026-09-03T17:00:00Z",
  },
  settings: { newsletter: true, gettingStarted: false, relativesCanAsk: true },
  trees: [
    { name: "Baldwin", type: "Root", joinedAt: "2026-09-03T17:00:00Z", founded: true },
    { name: "Curie", type: "Leaf", joinedAt: "2026-10-01T09:00:00Z", founded: false },
  ],
  entry: {
    homeTree: "Baldwin",
    firstName: "Rumi",
    middleName: null,
    preferredName: "",
    maidenName: "Morrison",
    lastName: "Baldwin",
    sex: "Female",
    born: "c. 1950",
    birthplace: "Vancouver, British Columbia, Canada",
    livesIn: "Hamilton, Ontario, Canada",
    died: false,
    deathDate: null,
    deathPlace: null,
    email: "rumi@example.com",
    emailShown: false,
    hiddenFromVisitors: false,
    hasPhoto: true,
  },
  family: [
    { relation: "Partner", name: "René Baldwin" },
    { relation: "Child", name: "André Franklin" },
  ],
};

describe("profileCsvRows", () => {
  it("lists the account, settings, trees, entry and family, leaving blanks out", () => {
    expect(profileCsvRows(PROFILE)).toEqual([
      ["Section", "Field", "Value"],
      ["Account", "Name", "Rumi"],
      ["Account", "Email", "rumi@example.com"],
      ["Account", "Member since", "3 September 2026"],
      ["Settings", "Weekly newsletter", "On"],
      ["Settings", "Getting started emails", "Off"],
      ["Settings", "Relatives can ask me to invite them", "On"],
      ["Trees", "Baldwin", "Root, founded 3 September 2026"],
      ["Trees", "Curie", "Leaf, joined 1 October 2026"],
      ["Your entry", "Home tree", "Baldwin"],
      ["Your entry", "First name", "Rumi"],
      ["Your entry", "Maiden name", "Morrison"],
      ["Your entry", "Last name", "Baldwin"],
      ["Your entry", "Sex", "Female"],
      ["Your entry", "Date of birth", "c. 1950"],
      ["Your entry", "Place of birth", "Vancouver, British Columbia, Canada"],
      ["Your entry", "Lives in", "Hamilton, Ontario, Canada"],
      ["Your entry", "Email", "rumi@example.com"],
      ["Your entry", "Show this email to other members of the tree", "No"],
      ["Your entry", "Hidden from visitors", "No"],
      ["Your entry", "Photo", "Yes (in the tagged media .zip)"],
      ["Your family", "Partner", "René Baldwin"],
      ["Your family", "Child", "André Franklin"],
    ]);
  });

  it("says when they've died, and leaves out what an account without an email lacks", () => {
    const rows = profileCsvRows({
      ...PROFILE,
      account: { ...PROFILE.account, email: "No email" },
      settings: { ...PROFILE.settings, relativesCanAsk: null },
      entry: { ...PROFILE.entry!, died: true, deathDate: "2019", email: null, livesIn: null },
      family: [],
    });
    expect(rows.map((r) => r[1])).not.toContain("Relatives can ask me to invite them");
    expect(rows.map((r) => r[1])).not.toContain("Show this email to other members of the tree");
    expect(rows).toContainEqual(["Your entry", "Has died", "Yes"]);
    expect(rows).toContainEqual(["Your entry", "Date of death", "2019"]);
  });

  it("has no entry rows without an entry", () => {
    const rows = profileCsvRows({ ...PROFILE, entry: null, family: [] });
    expect(rows.some((r) => r[0] === "Your entry")).toBe(false);
  });
});

describe("dateStem", () => {
  it("says as much of the date as is known, sortably", () => {
    expect(dateStem("1987-05-03", "day")).toBe("1987-05-03");
    expect(dateStem("1987-05-01", "month")).toBe("1987-05");
    expect(dateStem("1987-01-01", "year")).toBe("1987");
    expect(dateStem(null, null)).toBeNull();
  });
});

describe("safeFileStem", () => {
  it("drops what file systems refuse", () => {
    expect(safeFileStem('Nani: "the 1987/88 trip"?')).toBe("Nani the 1987 88 trip");
    expect(safeFileStem("..hidden.")).toBe("hidden");
    expect(safeFileStem("two\nlines")).toBe("two lines");
  });

  it("cuts long words at a space", () => {
    const long = "the whole family at the lake the summer before everyone moved away";
    const stem = safeFileStem(long, 30);
    expect(stem.length).toBeLessThanOrEqual(30);
    expect(long.startsWith(stem)).toBe(true);
    expect(stem.endsWith(" ")).toBe(false);
  });
});

describe("extensionOf", () => {
  it("reads a storage path's extension", () => {
    expect(extensionOf("tree/abc.JPG", "jpg")).toBe("jpg");
    expect(extensionOf("person/abc.webm", "webm")).toBe("webm");
    expect(extensionOf("person/abc", "webm")).toBe("webm");
  });
});

describe("fileNamer", () => {
  it("names each file once, whatever its case", () => {
    const name = fileNamer();
    expect(name("images", ["1987", "Wedding"], "photo", "jpg")).toBe("images/1987 Wedding.jpg");
    expect(name("images", ["1987", "wedding"], "photo", "jpg")).toBe("images/1987 wedding (2).jpg");
    expect(name("images", [null, ""], "photo", "jpg")).toBe("images/photo.jpg");
    expect(name("images", [null, "  "], "photo", "jpg")).toBe("images/photo (2).jpg");
    // Another folder is another place.
    expect(name("audio", ["1987", "Wedding"], "recording", "jpg")).toBe("audio/1987 Wedding.jpg");
  });
});

describe("storyMarkdown", () => {
  it("heads the words with what's known about them", () => {
    expect(
      storyMarkdown({
        title: "The boat to Mombasa",
        body: "We left at dawn.\n",
        toldBy: "Aalim Rattansi",
        toldOn: "1985-07-16",
        toldPrecision: "day",
        createdAt: "2026-10-01T12:00:00Z",
        credits: [
          { id: "1", name: "Amarshi Sayani", role: "storyteller" },
          { id: "2", name: "Aalim Rattansi", role: "interviewer" },
        ],
        about: ["Amarshi Sayani", "Rumi Baldwin"],
      }),
    ).toBe(
      [
        "# The boat to Mombasa",
        "",
        "About: Amarshi Sayani, Rumi Baldwin  ",
        "Added by Aalim Rattansi, 1 October 2026  ",
        "Told 16 July 1985  ",
        "Storyteller: Amarshi Sayani  ",
        "Interviewer: Aalim Rattansi",
        "",
        "---",
        "",
        "We left at dawn.",
        "",
      ].join("\n"),
    );
  });

  it("has a title even when the story doesn't", () => {
    const md = storyMarkdown({
      title: null,
      body: "words",
      toldBy: "A relative",
      toldOn: null,
      toldPrecision: null,
      createdAt: "2026-10-01T12:00:00Z",
      credits: [],
      about: [],
    });
    expect(md.startsWith("# A story\n\nAdded by A relative, 1 October 2026\n\n---")).toBe(true);
  });
});

describe("cardMarkdown", () => {
  it("writes the card out: the day, the thank-you, each signature and its files", () => {
    expect(
      cardMarkdown({
        year: 2026,
        opensOn: "2026-11-14",
        thanks: "thank you all",
        signatures: [
          {
            name: "Chidi Okafor",
            relation: null,
            message: "Happy birthday, love.\n",
            signedAt: "2026-11-01T09:00:00Z",
            hidden: false,
            files: ["Chidi Okafor voice memo.m4a"],
          },
          {
            name: "Emeka",
            relation: "your cousin",
            message: null,
            signedAt: "2026-11-02T09:00:00Z",
            hidden: true,
            files: ["Emeka drawing.svg"],
          },
        ],
      }),
    ).toBe(
      [
        "# Your birthday card, 14 November 2026",
        "",
        "2 signatures",
        "",
        "Your thank-you: “thank you all”",
        "",
        "---",
        "",
        "## Chidi Okafor",
        "",
        "Signed 1 November 2026  ",
        "Files: Chidi Okafor voice memo.m4a",
        "",
        "Happy birthday, love.",
        "",
        "---",
        "",
        "## Emeka",
        "",
        "Your cousin, signed 2 November 2026  ",
        "Hidden from everyone else  ",
        "Files: Emeka drawing.svg",
        "",
      ].join("\n"),
    );
  });

  it("counts one signature as one, with no thank-you", () => {
    const md = cardMarkdown({
      year: 2026,
      opensOn: "2026-11-14",
      thanks: null,
      signatures: [{ name: "Bisi", relation: null, message: "hi", signedAt: "2026-11-01T00:00:00Z", hidden: false, files: [] }],
    });
    expect(md).toBe("# Your birthday card, 14 November 2026\n\n1 signature\n\n---\n\n## Bisi\n\nSigned 1 November 2026\n\nhi\n");
  });
});
