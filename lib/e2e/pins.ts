import { keyId, validPublicKey, type PublicKey } from "@/lib/e2e/crypto";

/**
 * The keys a device has seen, pinned the first time (Step 174.6 review):
 * member → key version → `keyId`. The server serves members' keys; if it
 * ever serves a different key under a version this device already knows,
 * that's a swap, and the key isn't used. A new version is a member
 * starting over, which their family sees as a changed security code.
 */
export type Pins = Readonly<Record<string, Readonly<Record<number, string>>>>;

export type PinCheck =
  /** Known, or seen for the first time and now pinned. */
  | { ok: true; pins: Pins }
  /** Not a usable key, or not the key this device pinned for that version. */
  | { ok: false; reason: "invalid" | "swapped"; pins: Pins };

export function checkPin(pins: Pins, userId: string, key: PublicKey): PinCheck {
  if (!validPublicKey(key)) return { ok: false, reason: "invalid", pins };
  const id = keyId(key);
  const had = pins[userId]?.[key.version];
  if (had && had !== id) return { ok: false, reason: "swapped", pins };
  if (had) return { ok: true, pins };
  return {
    ok: true,
    pins: { ...pins, [userId]: { ...(pins[userId] ?? {}), [key.version]: id } },
  };
}
