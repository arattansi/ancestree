import "server-only";

import { timingSafeEqual } from "node:crypto";

import type { NextRequest } from "next/server";

/**
 * Whether a call to a cron route is Vercel Cron's: it carries
 * `Authorization: Bearer <CRON_SECRET>`, as the job sends it. Without the
 * secret set, nothing is.
 */
export function fromTheJob(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
