/**
 * End-to-end encryption for the messenger (Step 174.6). Only the people in
 * a conversation can read it: the database, its backups, Realtime and
 * anyone holding the service key see ciphertext.
 *
 * Each member has one messaging key, made on the first device that opens
 * the messenger and handed to their other devices by linking or a recovery
 * phrase: an X25519 pair to receive and an Ed25519 pair to sign. The public
 * halves are published (`messaging_keys`, versioned); a reset makes a new
 * version.
 *
 * A message is encrypted with a key of its own (XChaCha20-Poly1305, bound
 * to the conversation, the message and the sender), that key is sealed to
 * each member's current messaging key (an ephemeral X25519 exchange and
 * HKDF-SHA256), and the sender signs it (Ed25519) together with a
 * commitment to that key, so a server that made up a message couldn't pass
 * it off as a member's, and a sender can't show two members different
 * words. Text is padded to 256-byte steps before it's encrypted, so a
 * message's length shows only roughly.
 *
 * Audited libraries only (`@noble/*`, `@scure/bip39`); nothing here is
 * home-made but the framing. Plain functions over bytes, the same in the
 * browser, Node and the phone app.
 */

import { xchacha20poly1305 } from "@noble/ciphers/chacha.js";
import { ed25519, x25519 } from "@noble/curves/ed25519.js";
import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256, sha512 } from "@noble/hashes/sha2.js";
import { bytesToHex, concatBytes, randomBytes, utf8ToBytes } from "@noble/hashes/utils.js";
import {
  generateMnemonic,
  mnemonicToEntropy,
  validateMnemonic,
} from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";

/** The format every message is written in; a new one gets a new number. */
export const FORMAT = 1;

const LABEL = "ancestree/e2e/v1";
const SEALED_LENGTH = 32 + 24 + 32 + 16;

/** One version of a member's messaging key. */
export type KeyPair = {
  boxSecret: Uint8Array;
  boxPublic: Uint8Array;
  signSecret: Uint8Array;
  signPublic: Uint8Array;
};

/** Every version of their key a device holds; the highest is current. */
export type Keyring = Readonly<Record<number, KeyPair>>;

/** The published half of one version. */
export type PublicKey = {
  version: number;
  boxPublic: Uint8Array;
  signPublic: Uint8Array;
};

// ---------------------------------------------------------------------------
// Bytes
// ---------------------------------------------------------------------------

/** Standard base64, as Postgres's `encode(…, 'base64')` without its line breaks. */
export function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

/** Bytes from base64, or `null` for anything that isn't. */
export function fromBase64(text: string): Uint8Array | null {
  try {
    const binary = atob(text.replace(/\s+/g, ""));
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** URL-safe base64 without padding, for a link's fragment. */
export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/");
  return fromBase64(padded + "=".repeat((4 - (padded.length % 4)) % 4));
}

/** Parts joined so no two different lists give the same bytes. */
function frame(...parts: (string | Uint8Array)[]): Uint8Array {
  const out: Uint8Array[] = [];
  for (const part of parts) {
    const bytes = typeof part === "string" ? utf8ToBytes(part) : part;
    const length = new Uint8Array(4);
    new DataView(length.buffer).setUint32(0, bytes.length);
    out.push(length, bytes);
  }
  return concatBytes(...out);
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// Keys
// ---------------------------------------------------------------------------

/** A new messaging key. */
export function newKeyPair(): KeyPair {
  const boxSecret = x25519.utils.randomSecretKey();
  const signSecret = ed25519.utils.randomSecretKey();
  return keyPairFrom(boxSecret, signSecret);
}

function keyPairFrom(boxSecret: Uint8Array, signSecret: Uint8Array): KeyPair {
  return {
    boxSecret,
    boxPublic: x25519.getPublicKey(boxSecret),
    signSecret,
    signPublic: ed25519.getPublicKey(signSecret),
  };
}

/** The current version in a keyring, or `null` for an empty one. */
export function currentVersion(keyring: Keyring): number | null {
  const versions = Object.keys(keyring).map(Number);
  return versions.length ? Math.max(...versions) : null;
}

/**
 * Whether a published key is one to trust with a message: a real Ed25519
 * point under RFC 8032's rules (no small-order keys) and an X25519 key a
 * secret can be agreed with.
 */
export function validPublicKey(key: Pick<PublicKey, "boxPublic" | "signPublic">): boolean {
  if (key.boxPublic.length !== 32 || key.signPublic.length !== 32) return false;
  try {
    // Strict decoding, and no small-order points (which `isValidPublicKey`
    // lets through even strictly).
    if (ed25519.Point.fromBytes(key.signPublic, false).isSmallOrder()) return false;
    sharedSecret(x25519.utils.randomSecretKey(), key.boxPublic);
    return true;
  } catch {
    return false;
  }
}

/**
 * A key's identity: what a device pins when it first sees a member's key at
 * a version, and what "they match" records, so a key swapped under the
 * same version shows (Step 174.6 review).
 */
export function keyId(key: Pick<PublicKey, "boxPublic" | "signPublic">): string {
  return bytesToHex(sha256(frame(LABEL, "key-id", key.boxPublic, key.signPublic)));
}

/** A shared secret, refusing the all-zero one a malformed public key gives. */
function sharedSecret(secret: Uint8Array, publicKey: Uint8Array): Uint8Array {
  const shared = x25519.getSharedSecret(secret, publicKey);
  if (shared.every((b) => b === 0)) throw new Error("bad public key");
  return shared;
}

// ---------------------------------------------------------------------------
// Sealing a message's key to a member
// ---------------------------------------------------------------------------

/**
 * What a sealed key is bound to: the message and who it's for. The
 * sender's own copy of a message that waits for someone with no key yet
 * (Step 182) is bound to whom it waits for as well, so a message can be
 * sealed again later only if it truly waited, and only to them: the server
 * can't make such a copy of any other message without its key.
 */
function sealContext(
  messageId: string,
  userId: string,
  version: number,
  waitingFor?: string | null,
): Uint8Array {
  return waitingFor
    ? frame(LABEL, "seal-waiting", messageId, userId, String(version), waitingFor)
    : frame(LABEL, "seal", messageId, userId, String(version));
}

function sealingKey(shared: Uint8Array, ephemeral: Uint8Array, recipient: Uint8Array, context: Uint8Array) {
  return hkdf(sha256, shared, concatBytes(ephemeral, recipient), context, 32);
}

/** A message's key, readable only with the recipient's secret. */
export function sealKey(
  messageKey: Uint8Array,
  recipient: { userId: string; version: number; boxPublic: Uint8Array; waitingFor?: string | null },
  messageId: string,
): Uint8Array {
  const context = sealContext(messageId, recipient.userId, recipient.version, recipient.waitingFor);
  const ephemeralSecret = x25519.utils.randomSecretKey();
  const ephemeral = x25519.getPublicKey(ephemeralSecret);
  const key = sealingKey(
    sharedSecret(ephemeralSecret, recipient.boxPublic),
    ephemeral,
    recipient.boxPublic,
    context,
  );
  const nonce = randomBytes(24);
  const sealed = xchacha20poly1305(key, nonce, context).encrypt(messageKey);
  return concatBytes(ephemeral, nonce, sealed);
}

/**
 * The message's key from a sealed one, or `null` if it isn't theirs (or,
 * with `waitingFor`, isn't the sender's own copy of one that waited for them).
 */
export function openKey(
  sealed: Uint8Array,
  me: { userId: string; version: number; keys: KeyPair },
  messageId: string,
  waitingFor?: string | null,
): Uint8Array | null {
  if (sealed.length !== SEALED_LENGTH) return null;
  try {
    const context = sealContext(messageId, me.userId, me.version, waitingFor);
    const ephemeral = sealed.subarray(0, 32);
    const nonce = sealed.subarray(32, 56);
    const key = sealingKey(
      sharedSecret(me.keys.boxSecret, ephemeral),
      ephemeral,
      me.keys.boxPublic,
      context,
    );
    return xchacha20poly1305(key, nonce, context).decrypt(sealed.subarray(56));
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

/** Where a message belongs and who wrote it, which its encryption binds. */
export type MessageHeader = {
  id: string;
  conversationId: string;
  senderId: string;
  senderKeyVersion: number;
};

function messageAad(h: MessageHeader): Uint8Array {
  return frame(LABEL, "message", h.conversationId, h.id, h.senderId);
}

/** Commits the signature to the one key every member's copy opens with. */
function keyCommitment(messageKey: Uint8Array): Uint8Array {
  return sha256(frame(LABEL, "commit", messageKey));
}

function signatureInput(
  h: MessageHeader,
  nonce: Uint8Array,
  ciphertext: Uint8Array,
  messageKey: Uint8Array,
): Uint8Array {
  return frame(
    LABEL,
    "signature",
    h.conversationId,
    h.id,
    h.senderId,
    String(h.senderKeyVersion),
    nonce,
    sha256(ciphertext),
    keyCommitment(messageKey),
  );
}

/** The step a message's length is padded to. */
const PAD_STEP = 256;

/** Text padded with 0x80 then zeros to the next step (ISO/IEC 7816-4). */
function pad(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil((bytes.length + 1) / PAD_STEP) * PAD_STEP);
  out.set(bytes);
  out[bytes.length] = 0x80;
  return out;
}

function unpad(bytes: Uint8Array): Uint8Array | null {
  let end = bytes.length - 1;
  while (end >= 0 && bytes[end] === 0) end--;
  return end >= 0 && bytes[end] === 0x80 ? bytes.subarray(0, end) : null;
}

/**
 * A member a message is sealed to: their current published key. On the
 * sender's own copy of a message sealed to no one else, `waitingFor` is the
 * member it waits for (Step 182).
 */
export type Recipient = {
  userId: string;
  version: number;
  boxPublic: Uint8Array;
  waitingFor?: string | null;
};

/** A message ready for `send_message`. */
export type SealedMessage = {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  signature: Uint8Array;
  keys: { userId: string; version: number; sealedKey: Uint8Array }[];
};

/** Encrypt, seal to every member (the sender included) and sign. */
export function encryptMessage(
  text: string,
  header: MessageHeader,
  signSecret: Uint8Array,
  recipients: readonly Recipient[],
): SealedMessage {
  if (recipients.some((r) => r.waitingFor && r.userId !== header.senderId)) {
    throw new Error("only the sender's own copy waits");
  }
  const messageKey = randomBytes(32);
  const nonce = randomBytes(24);
  const ciphertext = xchacha20poly1305(messageKey, nonce, messageAad(header)).encrypt(
    pad(utf8ToBytes(text)),
  );
  const signature = ed25519.sign(
    signatureInput(header, nonce, ciphertext, messageKey),
    signSecret,
  );
  return {
    nonce,
    ciphertext,
    signature,
    keys: recipients.map((r) => ({
      userId: r.userId,
      version: r.version,
      sealedKey: sealKey(messageKey, r, header.id),
    })),
  };
}

/** A message as it arrives: encrypted, with the reader's own sealed key. */
export type EncryptedMessage = MessageHeader & {
  nonce: Uint8Array;
  ciphertext: Uint8Array;
  signature: Uint8Array;
  /** The version of the reader's key it was sealed to, and the sealed key. */
  keyVersion: number | null;
  sealedKey: Uint8Array | null;
};

export type Decrypted =
  | { ok: true; text: string }
  /**
   * `locked`: this device hasn't the reader's key it was sealed to;
   * `unverified`: its signature doesn't match the sender's key;
   * `unreadable`: anything else.
   */
  | { ok: false; reason: "locked" | "unverified" | "unreadable" };

/**
 * Open the reader's copy of its key, check who wrote it (under RFC 8032's
 * strict rules) and that everyone got the same key, then read it. `peer`,
 * the other member of a direct conversation, opens the reader's own copy of
 * a message of theirs that waited for that member (Step 182).
 */
export function decryptMessage(
  message: EncryptedMessage,
  me: { userId: string; keyring: Keyring },
  senderSignPublic: Uint8Array | null,
  peer?: string | null,
): Decrypted {
  const copies = message.senderId === me.userId && peer ? [null, peer] : [null];
  const opened = openMessage(message, me, senderSignPublic, copies);
  return opened.ok ? { ok: true, text: opened.text } : opened;
}

/**
 * `decryptMessage`, keeping the message's key it opened with; the reader's
 * copy opened as any of `copies` (`null` for a plain copy, else the member
 * the sender's own copy waited for).
 */
function openMessage(
  message: EncryptedMessage,
  me: { userId: string; keyring: Keyring },
  senderSignPublic: Uint8Array | null,
  copies: readonly (string | null)[],
): { ok: true; text: string; messageKey: Uint8Array } | Extract<Decrypted, { ok: false }> {
  if (message.keyVersion == null || !message.sealedKey) {
    return { ok: false, reason: "unreadable" };
  }
  const keys = me.keyring[message.keyVersion];
  if (!keys) return { ok: false, reason: "locked" };
  const sealedKey = message.sealedKey;
  const mine = { userId: me.userId, version: message.keyVersion, keys };
  const messageKey = copies.reduce<Uint8Array | null>(
    (found, waitingFor) => found ?? openKey(sealedKey, mine, message.id, waitingFor),
    null,
  );
  if (!messageKey) return { ok: false, reason: "unreadable" };
  if (!senderSignPublic) return { ok: false, reason: "unverified" };
  try {
    const signed = ed25519.verify(
      message.signature,
      signatureInput(message, message.nonce, message.ciphertext, messageKey),
      senderSignPublic,
      { zip215: false },
    );
    if (!signed) return { ok: false, reason: "unverified" };
  } catch {
    return { ok: false, reason: "unverified" };
  }
  try {
    const plain = unpad(
      xchacha20poly1305(messageKey, message.nonce, messageAad(message)).decrypt(
        message.ciphertext,
      ),
    );
    if (!plain) return { ok: false, reason: "unreadable" };
    return { ok: true, text: new TextDecoder("utf-8", { fatal: true }).decode(plain), messageKey };
  } catch {
    return { ok: false, reason: "unreadable" };
  }
}

/**
 * A message that waited (Step 182), its key sealed now to the member it
 * waited for: the sender's own copy opened, and only as a copy that waited
 * for that member (so a message sent as any other, or one that waited for
 * someone else, is never passed on, whatever the server says), the message
 * checked as the sender's own (signed by their own key at the version that
 * signed it, never the server's copy, and readable), then the same key
 * sealed to the member. Nothing is signed again: the signature commits to
 * that key, so the member checks it as any other. `null` otherwise.
 */
export function resealMessageKey(
  message: EncryptedMessage,
  me: { userId: string; keyring: Keyring },
  recipient: Recipient,
): Uint8Array | null {
  if (message.senderId !== me.userId || recipient.userId === me.userId) return null;
  const signer = me.keyring[message.senderKeyVersion];
  if (!signer) return null;
  const opened = openMessage(message, me, signer.signPublic, [recipient.userId]);
  if (!opened.ok) return null;
  return sealKey(
    opened.messageKey,
    { userId: recipient.userId, version: recipient.version, boxPublic: recipient.boxPublic },
    message.id,
  );
}

// ---------------------------------------------------------------------------
// Safety codes
// ---------------------------------------------------------------------------

/** A member's half of a safety code: 30 digits from their published key. */
function fingerprint(userId: string, key: PublicKey): string {
  // Iterated, as Signal's are, so making a key to match a code is slow.
  let hash = sha512(frame(LABEL, "safety", userId, key.signPublic, key.boxPublic));
  const input = concatBytes(key.signPublic, key.boxPublic);
  for (let i = 1; i < 5200; i++) hash = sha512(concatBytes(hash, input));
  let digits = "";
  for (let chunk = 0; chunk < 6; chunk++) {
    let n = 0;
    for (let b = 0; b < 5; b++) n = n * 256 + hash[chunk * 5 + b];
    digits += String(n % 100000).padStart(5, "0");
  }
  return digits;
}

/**
 * A conversation's safety code: 60 digits in twelve groups of five, the
 * same on both members' screens. Matching codes mean neither key was
 * swapped on the way.
 */
export function safetyCode(
  members: readonly { userId: string; key: PublicKey }[],
): string[] {
  const halves = [...members]
    .sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0))
    .map((m) => fingerprint(m.userId, m.key))
    .join("");
  return halves.match(/\d{5}/g) ?? [];
}

// ---------------------------------------------------------------------------
// Keyrings leaving the device: linking and the recovery phrase
// ---------------------------------------------------------------------------

type KeyringJson = Record<string, { box: string; sign: string }>;

function encodeKeyring(keyring: Keyring): Uint8Array {
  const json: KeyringJson = {};
  for (const [version, keys] of Object.entries(keyring)) {
    json[version] = { box: toBase64(keys.boxSecret), sign: toBase64(keys.signSecret) };
  }
  return utf8ToBytes(JSON.stringify(json));
}

function decodeKeyring(bytes: Uint8Array): Keyring | null {
  try {
    const json = JSON.parse(new TextDecoder().decode(bytes)) as KeyringJson;
    const keyring: Record<number, KeyPair> = {};
    for (const [version, keys] of Object.entries(json)) {
      const n = Number(version);
      const box = fromBase64(keys.box);
      const sign = fromBase64(keys.sign);
      if (!Number.isInteger(n) || n < 1 || box?.length !== 32 || sign?.length !== 32) {
        return null;
      }
      keyring[n] = keyPairFrom(box, sign);
    }
    return Object.keys(keyring).length ? keyring : null;
  } catch {
    return null;
  }
}

function keyringAad(purpose: "link" | "backup", userId: string): Uint8Array {
  return frame(LABEL, "keyring", purpose, userId);
}

/** A keyring encrypted under `key` for one purpose and one member. */
export function wrapKeyring(
  keyring: Keyring,
  key: Uint8Array,
  purpose: "link" | "backup",
  userId: string,
): Uint8Array {
  const nonce = randomBytes(24);
  const sealed = xchacha20poly1305(key, nonce, keyringAad(purpose, userId)).encrypt(
    encodeKeyring(keyring),
  );
  return concatBytes(nonce, sealed);
}

export function unwrapKeyring(
  blob: Uint8Array,
  key: Uint8Array,
  purpose: "link" | "backup",
  userId: string,
): Keyring | null {
  if (blob.length < 24 + 16) return null;
  try {
    const plain = xchacha20poly1305(key, blob.subarray(0, 24), keyringAad(purpose, userId)).decrypt(
      blob.subarray(24),
    );
    return decodeKeyring(plain);
  } catch {
    return null;
  }
}

/** A fresh one-time key for linking a device. */
export function newLinkKey(): Uint8Array {
  return randomBytes(32);
}

/** Whether a keyring's public halves are the published ones. */
export function matchesPublished(keys: KeyPair, published: PublicKey): boolean {
  return equal(keys.boxPublic, published.boxPublic) && equal(keys.signPublic, published.signPublic);
}

/** Twelve words, 128 bits: the recovery phrase. */
export function newRecoveryPhrase(): string {
  return generateMnemonic(wordlist, 128);
}

/** A phrase as typed: lower case, single spaces. */
export function normalisePhrase(phrase: string): string {
  return phrase.trim().toLowerCase().split(/\s+/).join(" ");
}

/**
 * The key a recovery phrase opens its backup with, or `null` for a phrase
 * that isn't one (a word misspelt, or out of order). The phrase is 128
 * random bits, so no slow hashing is needed.
 */
export function backupKeyFromPhrase(phrase: string): Uint8Array | null {
  const words = normalisePhrase(phrase);
  if (!validateMnemonic(words, wordlist)) return null;
  return hkdf(sha256, mnemonicToEntropy(words, wordlist), frame(LABEL, "backup-salt"), frame(LABEL, "backup"), 32);
}
