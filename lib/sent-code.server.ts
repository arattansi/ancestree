import "server-only";

import { cookies } from "next/headers";

import {
  readSentCode,
  SENT_CODE_COOKIE,
  sentCodeCookieOptions,
  sentCodeCookieValue,
  type SentCode,
  type SentCodeLink,
} from "@/lib/sent-code";

/** The code this page's form sent within the hour, if any. Safe in any server context. */
export async function readSentCodeFor(link: SentCodeLink): Promise<SentCode | null> {
  const store = await cookies();
  return readSentCode(store.get(SENT_CODE_COOKIE)?.value, link);
}

/** Remember a code just sent. Only from a server action or route handler. */
export async function rememberSentCode(sent: SentCode): Promise<void> {
  const store = await cookies();
  store.set(SENT_CODE_COOKIE, sentCodeCookieValue(sent), sentCodeCookieOptions());
}

/** Forget it: signed in, another email, or signed out. */
export async function forgetSentCode(): Promise<void> {
  const store = await cookies();
  if (store.has(SENT_CODE_COOKIE)) store.delete(SENT_CODE_COOKIE);
}
