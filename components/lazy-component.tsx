"use client";

import dynamic from "next/dynamic";
import * as React from "react";

/*
 * Code a page doesn't need to draw, fetched after it has (Step 87.4, audit
 * C1): the sheets, their dialogs, the cropper, the bell's list. Each is a
 * `next/dynamic` component with a `preload()` to fetch it sooner, on
 * hover or once the page is idle, so it's usually here before anyone taps.
 */

export type LazyComponent<P> = React.FC<P> & {
  /** Fetch the code now; resolves once it's here. */
  preload: () => Promise<unknown>;
};

/**
 * `load` names the module, as `next/dynamic`'s loader would. Until the code
 * is here, an instance shows `loading` (nothing by default). One made once
 * it's here draws the component itself, in the same render, just as a
 * static import would: a dialog opens with its transition and its focus
 * handling as before, with no empty frame first.
 */
export function lazyComponent<P extends object>(
  load: () => Promise<React.ComponentType<P>>,
  loading?: () => React.JSX.Element | null,
): LazyComponent<P> {
  let loaded: React.ComponentType<P> | null = null;
  let fetching: Promise<React.ComponentType<P>> | null = null;
  const preload = () => {
    fetching ??= load().then(
      (component) => (loaded = component),
      (error: unknown) => {
        // A chunk that didn't arrive (offline) is asked for again next time.
        fetching = null;
        throw error;
      },
    );
    return fetching;
  };
  const Dynamic = dynamic<P>(preload, { ssr: false, loading });
  function Lazy(props: P) {
    // Chosen once per instance, so one never swaps what it draws mid-life.
    const [Component] = React.useState<React.ComponentType<P>>(
      () => loaded ?? Dynamic,
    );
    return <Component {...props} />;
  }
  return Object.assign(Lazy, { preload });
}

/**
 * `[ready, loadNow]`: `ready` turns true once the page has painted, the
 * browser is idle and `preload` has fetched what it names, or sooner once
 * `loadNow()` (a pointer over what opens it) has. For mounting, closed, what
 * a tap would open, so it opens as it always did. Never on the server.
 */
export function useLoadedSoon(
  preload: () => Promise<unknown>,
): [ready: boolean, loadNow: () => void] {
  const [ready, setReady] = React.useState(false);
  const live = React.useRef(true);
  const loadNow = React.useCallback(() => {
    preload().then(
      () => {
        if (live.current) setReady(true);
      },
      () => {
        // Left to load when it's wanted.
      },
    );
  }, [preload]);
  React.useEffect(() => {
    live.current = true;
    const cancel = whenIdle(loadNow);
    return () => {
      live.current = false;
      cancel();
    };
  }, [loadNow]);
  return [ready, loadNow];
}

/** Run `task` once the browser is idle (within 2 s); returns a cancel. */
export function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(() => task(), { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 200);
  return () => window.clearTimeout(id);
}
