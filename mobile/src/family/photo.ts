import * as React from "react";

import { supabase } from "@/auth/supabase";

/** How long a signed photo address lasts, as the web's do (an hour). */
const TTL_S = 60 * 60;

/** Addresses already signed, by path and edge, with when they lapse. */
const signed = new Map<string, { url: string; until: number }>();

/**
 * A person's photo, signed for the member as the web signs it
 * (`lib/entry-view.server.ts`): the private `photos` bucket, scaled by
 * storage to `edge` points square on a 3× screen and cropped to fill it.
 * Null while it's signed, and when there's no photo or storage says no.
 */
export function usePhotoUrl(path: string | null | undefined, edge: number): string | null {
  const px = Math.round(edge * 3);
  const key = path ? `${path}@${px}` : null;
  const known = key ? signed.get(key) : undefined;
  const [url, setUrl] = React.useState<string | null>(
    known && known.until > Date.now() ? known.url : null,
  );

  React.useEffect(() => {
    if (!path || !key) {
      setUrl(null);
      return;
    }
    const seen = signed.get(key);
    if (seen && seen.until > Date.now()) {
      setUrl(seen.url);
      return;
    }
    let live = true;
    void supabase.storage
      .from("photos")
      .createSignedUrl(path, TTL_S, {
        transform: { width: px, height: px, resize: "cover" },
      })
      .then(({ data }) => {
        if (!data?.signedUrl) return;
        // A few minutes' grace, so a screen never holds one that lapses.
        signed.set(key, { url: data.signedUrl, until: Date.now() + (TTL_S - 300) * 1000 });
        if (live) setUrl(data.signedUrl);
      });
    return () => {
      live = false;
    };
  }, [path, key, px]);

  return url;
}
