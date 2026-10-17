import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { describe, expect, it } from "vitest";

import {
  backupKeyFromPhrase,
  currentVersion,
  decryptMessage,
  encryptMessage,
  fromBase64,
  fromBase64Url,
  matchesPublished,
  newKeyPair,
  newLinkKey,
  newRecoveryPhrase,
  normalisePhrase,
  resealMessageKey,
  safetyCode,
  toBase64,
  toBase64Url,
  unwrapKeyring,
  wrapKeyring,
  type EncryptedMessage,
  type KeyPair,
  type MessageHeader,
} from "@/lib/e2e/crypto";

const AMIRA = "00000000-0000-4000-8000-00000000000a";
const BILAL = "00000000-0000-4000-8000-00000000000b";
const CONVERSATION = "00000000-0000-4000-8000-0000000000c0";

const header = (over: Partial<MessageHeader> = {}): MessageHeader => ({
  id: "00000000-0000-4000-8000-000000000001",
  conversationId: CONVERSATION,
  senderId: AMIRA,
  senderKeyVersion: 1,
  ...over,
});

/** A message as `thread_messages` hands it to `reader`. */
function delivered(
  text: string,
  h: MessageHeader,
  sender: KeyPair,
  members: { userId: string; version: number; keys: KeyPair }[],
  reader: string,
): EncryptedMessage {
  const sealed = encryptMessage(
    text,
    h,
    sender.signSecret,
    members.map((m) => ({ userId: m.userId, version: m.version, boxPublic: m.keys.boxPublic })),
  );
  const mine = sealed.keys.find((k) => k.userId === reader)!;
  return {
    ...h,
    nonce: sealed.nonce,
    ciphertext: sealed.ciphertext,
    signature: sealed.signature,
    keyVersion: mine.version,
    sealedKey: mine.sealedKey,
  };
}

describe("a message", () => {
  const amira = newKeyPair();
  const bilal = newKeyPair();
  const members = [
    { userId: AMIRA, version: 1, keys: amira },
    { userId: BILAL, version: 3, keys: bilal },
  ];

  it("reads for each member, the sender too", () => {
    const toBilal = delivered("Salaam 🌳\nSee you Sunday?", header(), amira, members, BILAL);
    expect(
      decryptMessage(toBilal, { userId: BILAL, keyring: { 3: bilal } }, amira.signPublic),
    ).toEqual({ ok: true, text: "Salaam 🌳\nSee you Sunday?" });
    const toAmira = delivered("Salaam", header(), amira, members, AMIRA);
    expect(
      decryptMessage(toAmira, { userId: AMIRA, keyring: { 1: amira } }, amira.signPublic),
    ).toEqual({ ok: true, text: "Salaam" });
  });

  it("refuses a changed message, or one moved to another conversation or sender", () => {
    const m = delivered("hello", header(), amira, members, BILAL);
    const me = { userId: BILAL, keyring: { 3: bilal } };
    const flipped = m.ciphertext.slice();
    flipped[0] ^= 1;
    expect(decryptMessage({ ...m, ciphertext: flipped }, me, amira.signPublic)).toEqual({
      ok: false,
      reason: "unverified",
    });
    expect(
      decryptMessage({ ...m, conversationId: "00000000-0000-4000-8000-0000000000c1" }, me, amira.signPublic),
    ).toEqual({ ok: false, reason: "unverified" });
    expect(decryptMessage({ ...m, senderId: BILAL }, me, amira.signPublic)).toEqual({
      ok: false,
      reason: "unverified",
    });
  });

  it("refuses one signed by anyone but the sender", () => {
    const m = delivered("hello", header(), amira, members, BILAL);
    const me = { userId: BILAL, keyring: { 3: bilal } };
    expect(decryptMessage(m, me, bilal.signPublic).ok).toBe(false);
    expect(decryptMessage(m, me, null)).toEqual({ ok: false, reason: "unverified" });
    // The server making up a message in Amira's name, with its own key.
    const forged = delivered("send money", header(), newKeyPair(), members, BILAL);
    expect(decryptMessage(forged, me, amira.signPublic)).toEqual({
      ok: false,
      reason: "unverified",
    });
  });

  it("won't open a sealed key moved onto another message", () => {
    const first = delivered("one", header(), amira, members, BILAL);
    const second = delivered(
      "two",
      header({ id: "00000000-0000-4000-8000-000000000002" }),
      amira,
      members,
      BILAL,
    );
    const me = { userId: BILAL, keyring: { 3: bilal } };
    expect(decryptMessage({ ...second, sealedKey: first.sealedKey }, me, amira.signPublic)).toEqual({
      ok: false,
      reason: "unreadable",
    });
  });

  it("is locked on a device without the key it was sealed to", () => {
    const m = delivered("hello", header(), amira, members, BILAL);
    expect(
      decryptMessage(m, { userId: BILAL, keyring: { 1: newKeyPair() } }, amira.signPublic),
    ).toEqual({ ok: false, reason: "locked" });
    // Someone else's key under the right version opens nothing.
    expect(
      decryptMessage(m, { userId: BILAL, keyring: { 3: newKeyPair() } }, amira.signPublic),
    ).toEqual({ ok: false, reason: "unreadable" });
  });
});

describe("a message that waited (Step 182)", () => {
  const amira = newKeyPair();
  const bilal = newKeyPair();
  const amiraOnly = [{ userId: AMIRA, version: 1, keys: amira }];
  const toBilal = { userId: BILAL, version: 2, boxPublic: bilal.boxPublic };
  const amiraDevice = { userId: AMIRA, keyring: { 1: amira } };

  it("reads for the member it waited for once sealed to them, as Amira wrote it", () => {
    const waiting = delivered("Salaam, Bilal", header(), amira, amiraOnly, AMIRA);
    const sealedKey = resealMessageKey(waiting, amiraDevice, toBilal);
    expect(sealedKey).not.toBeNull();
    expect(
      decryptMessage(
        { ...waiting, keyVersion: 2, sealedKey },
        { userId: BILAL, keyring: { 2: bilal } },
        amira.signPublic,
      ),
    ).toEqual({ ok: true, text: "Salaam, Bilal" });
  });

  it("is sealed to that member and that message only", () => {
    const waiting = delivered("one", header(), amira, amiraOnly, AMIRA);
    const sealedKey = resealMessageKey(waiting, amiraDevice, toBilal)!;
    expect(
      decryptMessage(
        { ...waiting, keyVersion: 2, sealedKey },
        { userId: BILAL, keyring: { 2: newKeyPair() } },
        amira.signPublic,
      ),
    ).toEqual({ ok: false, reason: "unreadable" });
    const other = delivered("two", header({ id: "00000000-0000-4000-8000-000000000002" }), amira, amiraOnly, AMIRA);
    expect(
      decryptMessage(
        { ...other, keyVersion: 2, sealedKey },
        { userId: BILAL, keyring: { 2: bilal } },
        amira.signPublic,
      ),
    ).toEqual({ ok: false, reason: "unreadable" });
  });

  it("won't pass on what the server made up in Amira's name", () => {
    // Sealed to Amira's published key, but signed by a key of the server's.
    const forged = delivered("send money", header(), newKeyPair(), amiraOnly, AMIRA);
    expect(resealMessageKey(forged, amiraDevice, toBilal)).toBeNull();
    const changed = delivered("hello", header(), amira, amiraOnly, AMIRA);
    const flipped = changed.ciphertext.slice();
    flipped[0] ^= 1;
    expect(resealMessageKey({ ...changed, ciphertext: flipped }, amiraDevice, toBilal)).toBeNull();
  });

  it("only seals the device's own messages, to someone else", () => {
    const fromBilal = delivered("hi", header({ senderId: BILAL }), bilal, amiraOnly, AMIRA);
    expect(resealMessageKey(fromBilal, amiraDevice, toBilal)).toBeNull();
    const waiting = delivered("hi", header(), amira, amiraOnly, AMIRA);
    expect(
      resealMessageKey(waiting, amiraDevice, { userId: AMIRA, version: 1, boxPublic: amira.boxPublic }),
    ).toBeNull();
    // Signed by a version this device doesn't hold.
    expect(resealMessageKey({ ...waiting, senderKeyVersion: 2 }, amiraDevice, toBilal)).toBeNull();
  });
});

describe("what a sender can't do", () => {
  const amira = newKeyPair();
  const bilal = newKeyPair();
  const members = [
    { userId: AMIRA, version: 1, keys: amira },
    { userId: BILAL, version: 1, keys: bilal },
  ];

  it("can't seal Bilal a different key from everyone else's", () => {
    // A sender who seals Bilal his own key, to show him other words.
    const m = delivered("for everyone", header(), amira, members, BILAL);
    const other = delivered("only for Bilal", header(), amira, members, BILAL);
    expect(
      decryptMessage({ ...m, sealedKey: other.sealedKey }, { userId: BILAL, keyring: { 1: bilal } }, amira.signPublic),
    ).toEqual({ ok: false, reason: "unverified" });
  });

  it("pads text so short messages look alike", () => {
    const short = delivered("hi", header(), amira, members, BILAL);
    const longer = delivered("x".repeat(200), header(), amira, members, BILAL);
    expect(short.ciphertext.length).toBe(256 + 16);
    expect(longer.ciphertext.length).toBe(short.ciphertext.length);
    expect(delivered("x".repeat(300), header(), amira, members, BILAL).ciphertext.length).toBe(512 + 16);
  });
});

describe("known answers", () => {
  // Fixed keys and a message made once with them: if these stop reading,
  // the format changed and every stored message with it.
  const fixed = (n: number) => new Uint8Array(32).fill(n);
  const amira = {
    boxSecret: fixed(1),
    boxPublic: x25519.getPublicKey(fixed(1)),
    signSecret: fixed(2),
    signPublic: ed25519.getPublicKey(fixed(2)),
  };
  const bilal = {
    boxSecret: fixed(3),
    boxPublic: x25519.getPublicKey(fixed(3)),
    signSecret: fixed(4),
    signPublic: ed25519.getPublicKey(fixed(4)),
  };

  it("still reads a message written by this format", () => {
    const m: EncryptedMessage = {
      ...header(),
      nonce: fromBase64("v8U1KF/IfYz7T7EYri+KW+oTlEs9aeQi")!,
      ciphertext: fromBase64(
        "eOMrnrDb/BAOhe5UJvd2wEHSQ2UyuEIBt8ibZhkxbXfhniY39Ru2LbEzCGes8Ftct+Aj/lEdqBuHuXXDtl1ZOsZ3nq7zLGdKr3x4ukhSBHNdJbpcBrnBGs+fa1VnGjTNhc5unwjawYzCuEdF7fVviO0UlyooQW6gxGHpoN5cqiU1fwHwxKHSl52s5Tx8XK7ihWHgQmSJDoQiH8hLnUhuwMal6yXWvHjBgle56LkG+GyjTF4f3J+Tc/uA7csWkTqcVeK3bnLxsoQmwKtp+qzUbXv7TBxGxWy/yk/ajLgd3N07rnoW10g0yiKOr/wVLv58tjByDtXipCf1SmNUbmXmROis51yeoQaPM5nKwAT5YTk=",
      )!,
      signature: fromBase64(
        "i7WAsaOXSFbqLMSA7MvhYTsA5ihQfiKG4qP96ObyrqjtXuMqLw8GFAwpu5NpKSQxtdVv1qYt4/JM3EXvjI7XAA==",
      )!,
      keyVersion: 2,
      sealedKey: fromBase64(
        "Dob4lIpRx0CjRpy56dsQ02MRh0UVsWGBeQ2INLHOIlKQAaBrCW6U1GOz3/EzmGl+jx+4AmVm5WiwQV405aswaXqnttZoXjQbpzVh3NWgu/d0pTVa3t0q+OR10HQBzp4ftfAeA10kGvE=",
      )!,
    };
    expect(decryptMessage(m, { userId: BILAL, keyring: { 2: bilal } }, amira.signPublic)).toEqual({
      ok: true,
      text: "Salaam, it's Amira. 🌳",
    });
  });

  it("gives the same safety code", () => {
    expect(
      safetyCode([
        { userId: AMIRA, key: { version: 1, ...amira } },
        { userId: BILAL, key: { version: 2, ...bilal } },
      ]).join(" "),
    ).toBe("89851 34347 05585 73544 64617 51993 49586 38207 54210 09385 99348 42891");
  });

  it("opens the same backup key from the same phrase", () => {
    const words = "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
    expect(bytesToHex(backupKeyFromPhrase(words)!)).toBe(
      "214afaae4a724a908e5f34e1c10ca4b906b1d9a1cba41b4639cddf167338b946",
    );
  });
});

describe("safety codes", () => {
  const a = newKeyPair();
  const b = newKeyPair();
  const pa = { version: 1, boxPublic: a.boxPublic, signPublic: a.signPublic };
  const pb = { version: 1, boxPublic: b.boxPublic, signPublic: b.signPublic };

  it("is twelve groups of five, the same from either side", () => {
    const one = safetyCode([{ userId: AMIRA, key: pa }, { userId: BILAL, key: pb }]);
    const two = safetyCode([{ userId: BILAL, key: pb }, { userId: AMIRA, key: pa }]);
    expect(one).toEqual(two);
    expect(one).toHaveLength(12);
    for (const group of one) expect(group).toMatch(/^\d{5}$/);
  });

  it("changes when either key does", () => {
    const c = newKeyPair();
    const before = safetyCode([{ userId: AMIRA, key: pa }, { userId: BILAL, key: pb }]);
    const after = safetyCode([
      { userId: AMIRA, key: pa },
      { userId: BILAL, key: { version: 2, boxPublic: c.boxPublic, signPublic: c.signPublic } },
    ]);
    // Amira's half (her id sorts first) stays; Bilal's, whose key changed, doesn't.
    expect(after.slice(0, 6)).toEqual(before.slice(0, 6));
    expect(after.slice(6)).not.toEqual(before.slice(6));
  });
});

describe("keyrings leaving the device", () => {
  const keyring = { 1: newKeyPair(), 2: newKeyPair() };

  it("comes back whole under the right key, purpose and member", () => {
    const key = newLinkKey();
    const blob = wrapKeyring(keyring, key, "link", AMIRA);
    const back = unwrapKeyring(blob, key, "link", AMIRA)!;
    expect(currentVersion(back)).toBe(2);
    expect(matchesPublished(back[1], { version: 1, ...keyring[1] })).toBe(true);
    expect(matchesPublished(back[2], { version: 2, ...keyring[2] })).toBe(true);
    expect(unwrapKeyring(blob, newLinkKey(), "link", AMIRA)).toBeNull();
    expect(unwrapKeyring(blob, key, "backup", AMIRA)).toBeNull();
    expect(unwrapKeyring(blob, key, "link", BILAL)).toBeNull();
  });

  it("travels in a link's fragment", () => {
    const key = newLinkKey();
    const text = toBase64Url(key);
    expect(text).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(fromBase64Url(text)).toEqual(key);
    expect(fromBase64Url("not base64!")).toBeNull();
  });

  it("restores from a recovery phrase as typed", () => {
    const phrase = newRecoveryPhrase();
    expect(phrase.split(" ")).toHaveLength(12);
    const key = backupKeyFromPhrase(phrase)!;
    const blob = wrapKeyring(keyring, key, "backup", AMIRA);
    const typed = `  ${phrase.toUpperCase().split(" ").join("   ")}\n`;
    expect(normalisePhrase(typed)).toBe(phrase);
    expect(unwrapKeyring(blob, backupKeyFromPhrase(typed)!, "backup", AMIRA)).not.toBeNull();
    // A word that isn't on the list. (A swap of two words can still pass
    // BIP39's 4-bit checksum one time in sixteen, so it isn't a test.)
    const words = phrase.split(" ");
    words[3] = "ancestree";
    expect(backupKeyFromPhrase(words.join(" "))).toBeNull();
    expect(backupKeyFromPhrase(phrase.split(" ").slice(0, 11).join(" "))).toBeNull();
    expect(backupKeyFromPhrase("not a phrase")).toBeNull();
  });

  it("round-trips base64", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 255]);
    expect(fromBase64(toBase64(bytes))).toEqual(bytes);
    expect(fromBase64("%%%")).toBeNull();
  });
});
