import { describe, expect, it } from "vitest";

import {
  badgeCount,
  dayLabel,
  filterContacts,
  initialsOf,
  mergeMessages,
  messengerShownOn,
  newDay,
  parseInboxMessage,
  parseReadEvent,
  sendErrorText,
  shortWhen,
  totalUnread,
  trimMessage,
  withIncoming,
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
    lastBody: "hi",
    lastSenderId: NADIA,
    lastAt: "2026-10-16T10:00:00.000Z",
    lastReadAt: null,
    unread: 1,
    canSend: true,
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
  it("reads a message broadcast", () => {
    expect(
      parseInboxMessage({
        id: "m1",
        conversation_id: "c1",
        sender_id: NADIA,
        body: "hi",
        created_at: "2026-10-16T10:00:00Z",
      }),
    ).toEqual({
      id: "m1",
      conversationId: "c1",
      senderId: NADIA,
      body: "hi",
      createdAt: "2026-10-16T10:00:00Z",
    });
  });

  it("refuses anything else", () => {
    expect(parseInboxMessage(null)).toBeNull();
    expect(parseInboxMessage({ id: "m1" })).toBeNull();
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
    { userId: "a", name: "Nadia Haddad", personId: null, photoUrl: null, photoCrop: null, trees: ["The Haddad Family"] },
    { userId: "b", name: "Omar Khan", personId: null, photoUrl: null, photoCrop: null, trees: ["Khan"] },
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
