"use client";

import Link from "next/link";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  CONSENT_KEY,
  readConsentChoice,
  type ConsentChoice,
} from "@/lib/consent";

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * The consent banner (Step 137), for visitors where the law asks first:
 * until they answer, Analytics runs without its cookie. "allow" grants it
 * (Google's consent update), "no thanks" keeps it denied; either is kept
 * in the browser so it's asked once. Drawn only where `needsConsent`
 * says, from the request's country.
 */
/** The choice as kept in the browser; "unknown" while the server draws the page. */
const listeners = new Set<() => void>();
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function readChoice(): ConsentChoice | "none" {
  try {
    return readConsentChoice(localStorage.getItem(CONSENT_KEY)) ?? "none";
  } catch {
    return "none";
  }
}

export function ConsentBanner() {
  const choice = React.useSyncExternalStore(
    subscribe,
    readChoice,
    () => "unknown" as const,
  );
  const open = choice === "none";

  function answer(next: ConsentChoice) {
    try {
      localStorage.setItem(CONSENT_KEY, next);
    } catch {
      // Nowhere to keep it: they'll be asked again next time.
    }
    window.gtag?.("consent", "update", { analytics_storage: next });
    listeners.forEach((l) => l());
  }

  if (!open) return null;
  return (
    <div
      role="region"
      aria-label="Cookies"
      className="fixed inset-x-4 bottom-4 z-40 mx-auto flex max-w-md flex-col gap-3 rounded-lg border bg-background p-4 text-sm shadow-xl"
    >
      <p>
        ancestree counts visits with Google Analytics. May it set a cookie to
        tell your visits apart?{" "}
        <Link href="/privacy" className="underline underline-offset-4">
          What it collects
        </Link>
        .
      </p>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => answer("granted")}>
          allow
        </Button>
        <Button size="sm" variant="outline" onClick={() => answer("denied")}>
          no thanks
        </Button>
      </div>
    </div>
  );
}
