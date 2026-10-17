import { describe, expect, it } from "vitest";

import {
  badgeCount,
  dayLabel,
  exportFilename,
  exportText,
  filterContacts,
  initialsOf,
  isMuted,
  mergeMessages,
  messengerShownOn,
  mutedText,
  muteUntil,
  newDay,
  parseDeletedEvent,
  parseMutedEvent,
  parseReadEvent,
  parseWireMessage,
  sendErrorText,
  shortWhen,
  totalUnread,
  trimMessage,
  withIncoming,
  withMuted,
  withNewestPage,
  withRead,
  type ChatMessage,
  type ConversationSummary,
  type MessengerContact,
} from "@/lib/messenger";

const ME = "me";
const NADIA = "nadia";

function convo(over: Partial<ConversationSummary> = {}): ConversationSummary {
  return {
    id: "c1",
    otherUserId: NADIA,
    name: "Nadia",
    personId: null,
    photoUrl: null,
    photoCrop: null,
    otherKeyVersion: 1,
    last: null,
    lastBody: "hi",
    lastSenderId: NADIA,
    lastAt: "2026-10-16T10:00:00.000Z",
    lastReadAt: null,
    unread: 1,
    canSend: true,
    mutedUntil: null,
    ...over,
  };
}

function msg(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m2",
    conversationId: "c1",
    senderId: NADIA,
    body: "are you coming?",
    createdAt: "2026-10-16T11:00:00.000Z",
    senderKeyVersion: 1,
    ...over,
  };
}

describe("trimMessage", () => {
  it("drops space and blank lines at either end, keeps the middle", () => {
    expect(trimMessage("  hello\n there \n ")).toBe("hello\n there");
    expect(trimMessage(" \n\t ")).toBe("");
  });
});

describe("parsing the inbox", () => {
  const wire = {
    id: "m1",
    conversation_id: "c1",
    sender_id: NADIA,
    created_at: "2026-10-16T10:00:00Z",
    ciphertext: "AAAA",
    nonce: "BBBB",
    signature: "CCCC",
    sender_key_version: 2,
    key_version: 1,
    sealed_key: "DDDD",
  };

  it("reads a message broadcast, ciphertext and all", () => {
    expect(parseWireMessage(wire)).toEqual(wire);
    expect(parseWireMessage({ ...wire, key_version: null, sealed_key: null })).toMatchObject({
      key_version: null,
      sealed_key: null,
    });
  });

  it("refuses anything else, plain text included", () => {
    expect(parseWireMessage(null)).toBeNull();
    expect(parseWireMessage({ id: "m1" })).toBeNull();
    expect(
      parseWireMessage({ id: "m1", conversation_id: "c1", sender_id: NADIA, body: "hi", created_at: "x" }),
    ).toBeNull();
    expect(parseWireMessage({ ...wire, sender_key_version: 0 })).toBeNull();
    expect(parseReadEvent({ conversation_id: "c1" })).toBeNull();
    expect(
      parseReadEvent({ conversation_id: "c1", last_read_at: "2026-10-16T10:00:00Z" }),
    ).toEqual({ conversationId: "c1", lastReadAt: "2026-10-16T10:00:00Z" });
  });
});

describe("mergeMessages", () => {
  it("keeps each message once, oldest first", () => {
    const a = [msg({ id: "m1", createdAt: "2026-10-16T10:00:00Z" })];
    const b = [msg({ id: "m2" }), msg({ id: "m1", createdAt: "2026-10-16T10:00:00Z" })];
    expect(mergeMessages(a, b).map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  it("lets the confirmed message replace the pending one", () => {
    const pending = msg({ id: "m2", pending: true });
    const done = msg({ id: "m2" });
    expect(mergeMessages([pending], [done])).toEqual([done]);
    expect(mergeMessages([done], [pending])).toEqual([done]);
  });
});

describe("withIncoming", () => {
  it("puts the conversation first with one more unread", () => {
    const other = convo({ id: "c0", lastAt: "2026-10-16T10:30:00Z" });
    const next = withIncoming([other, convo()], msg(), ME, null);
    expect(next?.map((c) => c.id)).toEqual(["c1", "c0"]);
    expect(next?.[0]).toMatchObject({ lastBody: "are you coming?", unread: 2 });
  });

  it("counts nothing for one's own message or the open conversation", () => {
    expect(withIncoming([convo()], msg({ senderId: ME }), ME, null)?.[0].unread).toBe(1);
    expect(withIncoming([convo()], msg(), ME, "c1")?.[0].unread).toBe(1);
  });

  it("asks for the list again for a conversation it hasn't got", () => {
    expect(withIncoming([convo()], msg({ conversationId: "c9" }), ME, null)).toBeNull();
  });

  it("ignores a message older than the last one shown", () => {
    const next = withIncoming(
      [convo()],
      msg({ createdAt: "2026-10-16T09:00:00Z" }),
      ME,
      null,
    );
    expect(next?.[0]).toMatchObject({ lastBody: "hi", unread: 1 });
  });
});

describe("withRead", () => {
  it("clears the count once read up to the last message", () => {
    expect(withRead([convo()], "c1", "2026-10-16T10:00:00.000Z")[0].unread).toBe(0);
  });

  it("keeps it when something came after", () => {
    expect(withRead([convo()], "c1", "2026-10-16T09:00:00Z")[0].unread).toBe(1);
  });

  it("totals the badge", () => {
    expect(totalUnread([convo(), convo({ id: "c2", unread: 3 })])).toBe(4);
    expect(badgeCount(4)).toBe("4");
    expect(badgeCount(12)).toBe("9+");
  });
});

describe("filterContacts", () => {
  const contacts: MessengerContact[] = [
    { userId: "a", name: "Nadia Haddad", personId: null, photoUrl: null, photoCrop: null, trees: ["The Haddad Family"], keyVersion: 1 },
    { userId: "b", name: "Omar Khan", personId: null, photoUrl: null, photoCrop: null, trees: ["Khan"], keyVersion: null },
  ];

  it("matches every word, in a name or a shared tree", () => {
    expect(filterContacts(contacts, "nad").map((c) => c.userId)).toEqual(["a"]);
    expect(filterContacts(contacts, "haddad family").map((c) => c.userId)).toEqual(["a"]);
    expect(filterContacts(contacts, "  ").length).toBe(2);
    expect(filterContacts(contacts, "zz")).toEqual([]);
  });
});

describe("when", () => {
  const now = new Date(2026, 9, 16, 15, 0);
  const local = (y: number, m: number, d: number, h = 12) =>
    new Date(y, m, d, h).toISOString();

  it("says the time today, then yesterday, a weekday, a date", () => {
    expect(shortWhen(local(2026, 9, 16, 9), now)).toMatch(/^9:00\sAM$/);
    expect(shortWhen(local(2026, 9, 15), now)).toBe("Yesterday");
    expect(shortWhen(local(2026, 9, 12), now)).toBe("Mon");
    expect(shortWhen(local(2026, 8, 1), now)).toBe("Sep 1");
    expect(shortWhen(local(2025, 8, 1), now)).toBe("Sep 1, 2025");
  });

  it("names the days between messages", () => {
    expect(dayLabel(local(2026, 9, 16, 1), now)).toBe("Today");
    expect(dayLabel(local(2026, 9, 15), now)).toBe("Yesterday");
    expect(dayLabel(local(2026, 9, 12), now)).toBe("Monday");
    expect(newDay(undefined, local(2026, 9, 16))).toBe(true);
    expect(newDay(local(2026, 9, 16, 1), local(2026, 9, 16, 23))).toBe(false);
    expect(newDay(local(2026, 9, 15, 23), local(2026, 9, 16, 1))).toBe(true);
  });
});

describe("sendErrorText", () => {
  it("says why a message didn't go", () => {
    expect(sendErrorText("NO_SHARED_TREE")).toBe("You no longer share a tree.");
    expect(sendErrorText("SLOW_DOWN")).toBe("Slow down, then try again.");
    expect(sendErrorText("MESSAGE_TOO_LONG")).toBe("Keep it under 4,000 characters.");
    expect(sendErrorText(undefined)).toBe("Couldn't send. Try again.");
  });
});

describe("messengerShownOn", () => {
  it("sits on a member's own pages only", () => {
    expect(messengerShownOn("/tree")).toBe(true);
    expect(messengerShownOn("/tree/review")).toBe(true);
    expect(messengerShownOn("/family")).toBe(true);
    expect(messengerShownOn("/account")).toBe(true);
    expect(messengerShownOn("/")).toBe(false);
    expect(messengerShownOn("/library")).toBe(false);
    expect(messengerShownOn("/people/new")).toBe(false);
    expect(messengerShownOn("/treehouse")).toBe(false);
    expect(messengerShownOn(null)).toBe(false);
  });
});

describe("initialsOf", () => {
  it("takes the first and last words' first letters", () => {
    expect(initialsOf("Nadia Al Haddad")).toBe("NH");
    expect(initialsOf("omar")).toBe("O");
    expect(initialsOf("  ")).toBe("?");
  });
});

describe("muting (Step 177.4)", () => {
  const now = Date.parse("2026-10-16T12:00:00.000Z");

  it("is muted until the time it ends, or forever", () => {
    expect(isMuted(convo(), now)).toBe(false);
    expect(isMuted(convo({ mutedUntil: "infinity" }), now)).toBe(true);
    expect(isMuted(convo({ mutedUntil: "2026-10-16T13:00:00.000Z" }), now)).toBe(true);
    expect(isMuted(convo({ mutedUntil: "2026-10-16T11:00:00.000Z" }), now)).toBe(false);
  });

  it("leaves muted conversations out of the badge", () => {
    const list = [
      convo({ id: "a", unread: 2 }),
      convo({ id: "b", unread: 3, mutedUntil: "infinity" }),
      convo({ id: "c", unread: 1, mutedUntil: "2026-10-16T11:00:00.000Z" }),
    ];
    expect(totalUnread(list, now)).toBe(3);
  });

  it("ends a mute after so many hours, or never", () => {
    expect(muteUntil(8, new Date(now))).toBe("2026-10-16T20:00:00.000Z");
    expect(muteUntil(null, new Date(now))).toBe("infinity");
  });

  it("says until when", () => {
    const at = new Date(2026, 9, 16, 9, 0);
    expect(mutedText("infinity", at)).toBe("Muted");
    expect(mutedText(new Date(2026, 9, 16, 17, 0).toISOString(), at)).toBe("Muted until 5:00 PM");
    expect(mutedText(new Date(2026, 9, 17, 1, 0).toISOString(), at)).toBe(
      "Muted until tomorrow, 1:00 AM",
    );
    expect(mutedText(new Date(2026, 9, 23, 9, 0).toISOString(), at)).toBe("Muted until Oct 23");
  });

  it("reads a mute from another tab and applies it", () => {
    expect(parseMutedEvent({ conversation_id: "c1", muted_until: "infinity" })).toEqual({
      conversationId: "c1",
      mutedUntil: "infinity",
    });
    expect(parseMutedEvent({ conversation_id: "c1", muted_until: null })).toEqual({
      conversationId: "c1",
      mutedUntil: null,
    });
    expect(parseMutedEvent({ conversation_id: "c1", muted_until: 3 })).toBeNull();
    expect(parseMutedEvent(null)).toBeNull();
    const list = withMuted([convo(), convo({ id: "c2" })], "c2", "infinity");
    expect(list.map((c) => c.mutedUntil)).toEqual([null, "infinity"]);
  });
});

describe("deleting a message (Step 177.5)", () => {
  it("reads a deleted message's broadcast", () => {
    expect(parseDeletedEvent({ id: "m1", conversation_id: "c1" })).toEqual({
      id: "m1",
      conversationId: "c1",
    });
    expect(parseDeletedEvent({ id: "m1" })).toBeNull();
  });

  const at = (minute: number) => `2026-10-16T10:${String(minute).padStart(2, "0")}:00.000Z`;
  const m = (id: string, minute: number, over: Partial<ChatMessage> = {}) =>
    msg({ id, createdAt: at(minute), ...over });

  it("drops what a re-read newest page no longer has", () => {
    const had = [m("a", 1), m("b", 2), m("c", 3)];
    const page = [m("a", 1), m("c", 3)];
    expect(withNewestPage(had, page, false).map((x) => x.id)).toEqual(["a", "c"]);
  });

  it("keeps older messages beyond a whole page, newer ones and pending sends", () => {
    const had = [m("old", 1), m("b", 2), m("gone", 3), m("c", 4), m("new", 6), m("p", 7, { pending: true })];
    const page = [m("b", 2), m("c", 4)];
    expect(withNewestPage(had, page, true).map((x) => x.id)).toEqual(["old", "b", "c", "new", "p"]);
  });

  it("empties a thread whose every message went", () => {
    const had = [m("a", 1), m("p", 2, { pending: true })];
    expect(withNewestPage(had, [], false).map((x) => x.id)).toEqual(["p"]);
  });
});

describe("exporting (Step 177.6)", () => {
  it("writes each conversation out, days marked, unread ones saying why", () => {
    const text = exportText(
      [
        {
          name: "Nadia Haddad",
          messages: [
            msg({ id: "1", senderId: ME, body: "Hello", createdAt: new Date(2026, 9, 12, 14, 41).toISOString() }),
            msg({ id: "2", body: "Hi!\nHow are you?", createdAt: new Date(2026, 9, 12, 14, 43).toISOString() }),
            msg({ id: "3", body: "", status: "locked", createdAt: new Date(2026, 9, 13, 9, 5).toISOString() }),
          ],
        },
        { name: "Bilal", messages: [] },
      ],
      ME,
      new Date(2026, 9, 16, 12, 0),
    );
    expect(text).toBe(
      [
        "Your ancestree messages",
        "Read on this device on Oct 16, 2026. Only the people in each conversation can read them: keep this file somewhere safe.",
        "",
        "",
        "== Nadia Haddad ==",
        "",
        "Monday, October 12, 2026",
        "2:41 PM  You: Hello",
        "2:43 PM  Nadia Haddad: Hi!",
        "                       How are you?",
        "",
        "Tuesday, October 13, 2026",
        "9:05 AM  Nadia Haddad: [Locked on this device]",
        "",
        "",
        "== Bilal ==",
        "",
        "No messages.",
        "",
      ].join("\n"),
    );
  });

  it("names the file by the day", () => {
    expect(exportFilename(new Date(2026, 0, 5))).toBe("ancestree-messages-2026-01-05.txt");
  });
});
