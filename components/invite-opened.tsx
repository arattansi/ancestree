"use client";

import * as React from "react";

import { OPENED_PATH } from "@/lib/invite-events";

// Once a page load, however often React runs the effect.
const noted = new Set<string>();

/**
 * Says an invite's page was seen (Step 216), from the browser once it's
 * drawn: a chat app fetching the link to draw its preview runs no script,
 * so it isn't counted as someone opening it. Draws nothing.
 */
export function InviteOpened({ token }: { token: string }) {
  React.useEffect(() => {
    if (noted.has(token)) return;
    noted.add(token);
    void fetch(OPENED_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
      keepalive: true,
    }).catch(() => {});
  }, [token]);
  return null;
}
