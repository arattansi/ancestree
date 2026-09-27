"use client";

import { useEffect } from "react";

import "./globals.css";

/**
 * When the root layout itself fails (Step 61): the page's own document, as
 * `global-error` replaces the layout, with a way to try again.
 * `SiteHeader` falls back to its bare bar rather than fail, so this is for
 * what's left.
 */
export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background px-6 text-center text-foreground">
        <title>Something went wrong · ancestree</title>
        <h1 className="text-lg font-semibold">Something Went Wrong</h1>
        <p className="text-sm text-muted-foreground">
          ancestree couldn&rsquo;t load.
        </p>
        <button
          type="button"
          onClick={() => retry()}
          className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
        {error.digest ? (
          <p className="text-xs text-muted-foreground">
            Reference {error.digest}
          </p>
        ) : null}
      </body>
    </html>
  );
}
