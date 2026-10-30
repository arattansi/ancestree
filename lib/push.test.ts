import { describe, expect, it } from "vitest";

import {
  addressPushes,
  cardReadyPush,
  cardStartedPush,
  goneTokens,
  messagePush,
  PUSH_BATCH,
  pushBatches,
  storyPush,
  type ExpoPush,
} from "@/lib/push";

const CONVERSATION = "11111111-1111-4111-8111-111111111111";
const STORY = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";

describe("messagePush", () => {
  it("says who wrote, never what", () => {
    const note = messagePush({ senderName: "Hassan Rattansi", conversationId: CONVERSATION });
    expect(note).toEqual({
      title: "Hassan Rattansi",
      body: "New message",
      data: { kind: "message", conversationId: CONVERSATION },
      channelId: "messages",
      threadId: CONVERSATION,
    });
  });

  it("names a relative when the name is blank", () => {
    expect(messagePush({ senderName: "  ", conversationId: CONVERSATION }).title).toBe(
      "A relative",
    );
  });
});

describe("storyPush", () => {
  it("says whom it's about, with its title", () => {
    const note = storyPush({
      storyId: STORY,
      personId: PERSON,
      title: "The boat to Mombasa",
      about: "Amina Khan",
    });
    expect(note).toEqual({
      title: "New story about Amina Khan",
      body: "“The boat to Mombasa”",
      data: { kind: "story", storyId: STORY, personId: PERSON },
      channelId: "stories",
    });
  });

  it("has no body without a title", () => {
    const note = storyPush({ storyId: STORY, personId: PERSON, title: null, about: "Amina Khan" });
    expect(note.body).toBeUndefined();
    expect("body" in note).toBe(false);
  });

  it("falls back when nobody can be named", () => {
    expect(storyPush({ storyId: STORY, personId: PERSON, title: " ", about: null }).title).toBe(
      "New story",
    );
  });
});

describe("birthday card pushes", () => {
  it("asks those reminded to sign a card just started", () => {
    const note = cardStartedPush({
      personId: PERSON,
      firstName: "Ada",
      body: "Chidi Okafor started a card for Ada's birthday on 14 November.",
    });
    expect(note).toEqual({
      title: "Ada’s birthday card",
      body: "Chidi Okafor started a card for Ada's birthday on 14 November. Sign it?",
      data: { kind: "card", personId: PERSON, open: false },
      channelId: "cards",
    });
  });

  it("tells the person their own card is here, and opens it", () => {
    expect(cardReadyPush({ personId: PERSON, firstName: "Ada", signatures: 14 })).toEqual({
      title: "Happy birthday, Ada",
      body: "Your birthday card is here: 14 people signed it.",
      data: { kind: "card", personId: PERSON, open: true },
      channelId: "cards",
    });
    expect(cardReadyPush({ personId: PERSON, firstName: " ", signatures: 1 })).toMatchObject({
      title: "Happy birthday",
      body: "Your birthday card is here: 1 person signed it.",
    });
  });
});

describe("addressPushes", () => {
  it("sends each member's push to every phone of theirs, and none to anyone without one", () => {
    const note = messagePush({ senderName: "Hassan", conversationId: CONVERSATION });
    const pushes = addressPushes(
      [
        { userId: "a", note },
        { userId: "b", note },
      ],
      [
        { user_id: "a", token: "ExponentPushToken[a1]" },
        { user_id: "a", token: "ExponentPushToken[a2]" },
        { user_id: "c", token: "ExponentPushToken[c1]" },
      ],
    );
    expect(pushes.map((p) => p.to)).toEqual(["ExponentPushToken[a1]", "ExponentPushToken[a2]"]);
    expect(pushes.every((p) => p.sound === "default" && p.title === "Hassan")).toBe(true);
  });
});

describe("pushBatches", () => {
  it("splits into Expo's hundreds", () => {
    const sizes = pushBatches(Array.from({ length: 250 }, (_, i) => i)).map((b) => b.length);
    expect(sizes).toEqual([PUSH_BATCH, PUSH_BATCH, 50]);
    expect(pushBatches([])).toEqual([]);
  });
});

describe("goneTokens", () => {
  const sent = ["ExponentPushToken[a]", "ExponentPushToken[b]", "ExponentPushToken[c]"].map(
    (to) => ({ to }) as ExpoPush,
  );

  it("finds the phones the app is gone from, by ticket order", () => {
    expect(
      goneTokens(sent, {
        data: [
          { status: "ok", id: "x" },
          { status: "error", message: "gone", details: { error: "DeviceNotRegistered" } },
          { status: "error", message: "too big", details: { error: "MessageTooBig" } },
        ],
      }),
    ).toEqual(["ExponentPushToken[b]"]);
  });

  it("reads nothing from an answer it doesn't know", () => {
    expect(goneTokens(sent, null)).toEqual([]);
    expect(goneTokens(sent, { errors: [{ code: "PUSH_TOO_MANY_EXPERIENCE_IDS" }] })).toEqual([]);
  });
});
