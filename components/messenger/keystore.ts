"use client";

import type { KeyPair, Keyring } from "@/lib/e2e/crypto";
import type { Pins } from "@/lib/e2e/pins";

/*
 * Where a device keeps its messaging keys (Step 174.6): the browser's
 * IndexedDB, by member, never sent anywhere but encrypted (a link to the
 * member's other device, or a backup under their recovery phrase). Also
 * which of their family's safety codes this member has checked.
 */

const DB_NAME = "ancestree-e2e";
const KEYRINGS = "keyrings";
const VERIFIED = "verified";

let opening: Promise<IDBDatabase> | null = null;

/** Whether this browser can keep keys at all (private windows sometimes can't). */
export function keystoreAvailable(): boolean {
  return typeof indexedDB !== "undefined";
}

function db(): Promise<IDBDatabase> {
  opening ??= new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(KEYRINGS);
      request.result.createObjectStore(VERIFIED);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  }).catch((error) => {
    opening = null;
    throw error;
  });
  return opening;
}

async function get<T>(store: string, key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

async function put(store: string, key: string, value: unknown): Promise<void> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(store, "readwrite");
    tx.objectStore(store).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** This member's keyring on this device, or `null`. */
export async function loadKeyring(userId: string): Promise<Keyring | null> {
  const stored = await get<Keyring>(KEYRINGS, userId);
  return stored && Object.keys(stored).length ? stored : null;
}

/**
 * Keep a keyring, adding to what this device already holds. A version it
 * already has is never replaced: a link or backup can't overwrite the only
 * copy of a key.
 */
export async function saveKeyring(userId: string, keyring: Keyring): Promise<Keyring> {
  const had = (await loadKeyring(userId)) ?? {};
  const merged = { ...keyring, ...had };
  await put(KEYRINGS, userId, merged);
  return merged;
}

/**
 * A key made but not yet known to be published: kept first, so a reply
 * lost on the way back can't leave a published key nobody holds.
 */
export async function loadPendingKey(userId: string): Promise<KeyPair | null> {
  return (await get<KeyPair>(KEYRINGS, `pending:${userId}`)) ?? null;
}

export async function savePendingKey(userId: string, keys: KeyPair | null): Promise<void> {
  await put(KEYRINGS, `pending:${userId}`, keys);
}

/** The keys this device has seen, pinned the first time (`checkPin`). */
export async function loadPins(userId: string): Promise<Pins> {
  return (await get<Pins>(KEYRINGS, `pins:${userId}`)) ?? {};
}

export async function savePins(userId: string, pins: Pins): Promise<void> {
  await put(KEYRINGS, `pins:${userId}`, pins);
}

/** The key (`keyId`) of each relative whose safety code this member checked. */
export async function loadVerified(userId: string): Promise<Record<string, string>> {
  const stored = (await get<Record<string, unknown>>(VERIFIED, userId)) ?? {};
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
  await put(VERIFIED, userId, verified);
  return verified;
}

/**
 * One tab at a time sets up a member's keys, so two tabs opened together
 * don't both make one (Web Locks; where there are none, it just runs).
 */
export function withKeyLock<T>(userId: string, task: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && navigator.locks?.request) {
    return navigator.locks.request(`ancestree-e2e:${userId}`, task) as Promise<T>;
  }
  return task();
}
