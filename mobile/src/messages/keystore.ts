import { randomUUID } from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

import { fromBase64, toBase64, type KeyPair, type Keyring } from "@/lib/e2e/crypto";
import type { Pins } from "@/lib/e2e/pins";

/*
 * Where the phone keeps its messaging keys (Step 179.1), as the web keeps
 * them in IndexedDB (`components/messenger/keystore.ts`): the Keychain, by
 * member, never sent anywhere but encrypted (a link to the member's other
 * device, or a backup under their recovery phrase). Also the keys this
 * phone has pinned, and which of their family's safety codes the member
 * checked here. The Keychain keeps them when the app is deleted.
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

/*
 * How a value is kept: written whole under a new slot (in chunks, as one
 * Keychain item takes about 2 KB), and only then does the value's name
 * point at it, in one write. A write cut short leaves the old value in
 * place, never half of each. On this phone only: never in a backup, so a
 * restored phone is linked again like any new device (as the web's
 * IndexedDB never leaves its browser).
 */
const CHUNK = 1800;
const ON_THIS_PHONE: SecureStore.SecureStoreOptions = {
  keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
};

type Items = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};

const items: Items =
  Platform.OS === "web"
    ? {
        // The browser preview only.
        get: async (key) => (typeof localStorage === "undefined" ? null : localStorage.getItem(key)),
        set: async (key, value) => localStorage?.setItem(key, value),
        remove: async (key) => localStorage?.removeItem(key),
      }
    : {
        get: (key) => SecureStore.getItemAsync(key, ON_THIS_PHONE),
        set: (key, value) => SecureStore.setItemAsync(key, value, ON_THIS_PHONE),
        remove: (key) => SecureStore.deleteItemAsync(key, ON_THIS_PHONE),
      };

async function writeSlot(slot: string, text: string) {
  const count = Math.max(1, Math.ceil(text.length / CHUNK));
  for (let i = 0; i < count; i++) {
    await items.set(`${slot}.${i}`, text.slice(i * CHUNK, (i + 1) * CHUNK));
  }
  await items.set(slot, String(count));
}

async function readSlot(slot: string): Promise<string | null> {
  const count = Number(await items.get(slot));
  if (!count) return null;
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const part = await items.get(`${slot}.${i}`);
    if (part == null) return null;
    parts.push(part);
  }
  return parts.join("");
}

async function removeSlot(slot: string) {
  const count = Number(await items.get(slot)) || 0;
  await items.remove(slot);
  for (let i = 0; i < count; i++) await items.remove(`${slot}.${i}`);
}

/** One write at a time for each value. */
const queues = new Map<string, Promise<unknown>>();

function queued<T>(key: string, task: () => Promise<T>): Promise<T> {
  const run = (queues.get(key) ?? Promise.resolve()).then(task, task);
  queues.set(key, run.catch(() => undefined));
  return run;
}

/**
 * A value, `undefined` when none was ever kept. One that's there but can't
 * be read throws: the keys and pins are never quietly taken as empty,
 * which would trust whatever key the server served next.
 */
async function get<T>(key: string): Promise<T | undefined> {
  return queued(key, async () => {
    const slot = await items.get(key);
    if (!slot) return undefined;
    const text = await readSlot(slot);
    if (text == null) throw new Error(`unreadable ${key}`);
    return JSON.parse(text) as T;
  });
}

function put(key: string, value: unknown): Promise<void> {
  return queued(key, async () => {
    const had = await items.get(key);
    if (value == null) {
      await items.remove(key);
    } else {
      const slot = `${key}.${randomUUID()}`;
      await writeSlot(slot, JSON.stringify(value));
      await items.set(key, slot);
    }
    if (had) await removeSlot(had);
  });
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
