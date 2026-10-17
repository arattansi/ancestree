import { fromBase64, toBase64, type KeyPair, type Keyring } from "@/lib/e2e/crypto";
import type { Pins } from "@/lib/e2e/pins";
import { secureStorage } from "@/auth/secure-storage";

/*
 * Where the phone keeps its messaging keys (Step 179.1), as the web keeps
 * them in IndexedDB (`components/messenger/keystore.ts`): the Keychain, by
 * member, never sent anywhere but encrypted (a link to the member's other
 * device, or a backup under their recovery phrase). Also the keys this
 * phone has pinned, and which of their family's safety codes the member
 * checked here. The Keychain keeps them when the app is deleted, as it
 * keeps the session.
 */

type StoredPair = { box: string; boxPublic: string; sign: string; signPublic: string };

const name = (what: string, userId: string) => `ancestree-e2e.${what}.${userId}`;

function encodePair(keys: KeyPair): StoredPair {
  return {
    box: toBase64(keys.boxSecret),
    boxPublic: toBase64(keys.boxPublic),
    sign: toBase64(keys.signSecret),
    signPublic: toBase64(keys.signPublic),
  };
}

function decodePair(stored: StoredPair | undefined): KeyPair | null {
  if (!stored) return null;
  const boxSecret = fromBase64(stored.box);
  const boxPublic = fromBase64(stored.boxPublic);
  const signSecret = fromBase64(stored.sign);
  const signPublic = fromBase64(stored.signPublic);
  if (
    boxSecret?.length !== 32 ||
    boxPublic?.length !== 32 ||
    signSecret?.length !== 32 ||
    signPublic?.length !== 32
  )
    return null;
  return { boxSecret, boxPublic, signSecret, signPublic };
}

/** One write at a time for each value: a chunked one isn't atomic. */
const queues = new Map<string, Promise<unknown>>();

function queued<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

async function get<T>(key: string): Promise<T | undefined> {
  const text = await queued(key, () => secureStorage.getItem(key));
  if (!text) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch {
    return undefined;
  }
}

function put(key: string, value: unknown): Promise<void> {
  return queued(key, () =>
    value == null ? secureStorage.removeItem(key) : secureStorage.setItem(key, JSON.stringify(value)),
  );
}

/** This member's keyring on this phone, or `null`. */
export async function loadKeyring(userId: string): Promise<Keyring | null> {
  const stored = await get<Record<string, StoredPair>>(name("keyring", userId));
  if (!stored) return null;
  const keyring: Record<number, KeyPair> = {};
  for (const [version, pair] of Object.entries(stored)) {
    const keys = decodePair(pair);
    if (keys && Number.isInteger(Number(version))) keyring[Number(version)] = keys;
  }
  return Object.keys(keyring).length ? keyring : null;
}

/**
 * Keep a keyring, adding to what this phone already holds. A version it
 * already has is never replaced: a link or backup can't overwrite the only
 * copy of a key.
 */
export async function saveKeyring(userId: string, keyring: Keyring): Promise<Keyring> {
  const had = (await loadKeyring(userId)) ?? {};
  const merged: Keyring = { ...keyring, ...had };
  await put(
    name("keyring", userId),
    Object.fromEntries(Object.entries(merged).map(([v, keys]) => [v, encodePair(keys)])),
  );
  return merged;
}

/**
 * A key made but not yet known to be published: kept first, so a reply
 * lost on the way back can't leave a published key nobody holds.
 */
export async function loadPendingKey(userId: string): Promise<KeyPair | null> {
  return decodePair(await get<StoredPair>(name("pending", userId)));
}

export async function savePendingKey(userId: string, keys: KeyPair | null): Promise<void> {
  await put(name("pending", userId), keys ? encodePair(keys) : null);
}

/** The keys this phone has seen, pinned the first time (`checkPin`). */
export async function loadPins(userId: string): Promise<Pins> {
  return (await get<Pins>(name("pins", userId))) ?? {};
}

export async function savePins(userId: string, pins: Pins): Promise<void> {
  await put(name("pins", userId), pins);
}

/** The key (`keyId`) of each relative whose safety code this member checked. */
export async function loadVerified(userId: string): Promise<Record<string, string>> {
  const stored = (await get<Record<string, unknown>>(name("verified", userId))) ?? {};
  return Object.fromEntries(
    Object.entries(stored).filter((e): e is [string, string] => typeof e[1] === "string"),
  );
}

export async function saveVerified(
  userId: string,
  other: string,
  key: string | null,
): Promise<Record<string, string>> {
  const verified = { ...(await loadVerified(userId)) };
  if (key == null) delete verified[other];
  else verified[other] = key;
  await put(name("verified", userId), verified);
  return verified;
}

const locks = new Map<string, Promise<unknown>>();

/**
 * One setting-up of a member's keys at a time, so two starts close
 * together don't both make one (the web's Web Lock, in one JavaScript
 * runtime).
 */
export function withKeyLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const run = (locks.get(userId) ?? Promise.resolve()).then(task, task);
  locks.set(userId, run.catch(() => undefined));
  return run;
}
