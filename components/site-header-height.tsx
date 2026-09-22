"use client";

import * as React from "react";

/**
 * Keeps `--site-header-height` on the root element in step with the header,
 * whose buttons wrap to a second row on a narrow phone. There a node's
 * details sheet starts below the header rather than over it, so the
 * navigation stays in reach (see `[data-docked-sheet]` in globals.css).
 * Renders a hidden marker inside the header so it can find it.
 */
export function SiteHeaderHeight() {
  const ref = React.useRef<HTMLSpanElement>(null);

  React.useEffect(() => {
    const header = ref.current?.closest("header");
    if (!header) return;
    const root = document.documentElement;
    const update = () =>
      root.style.setProperty(
        "--site-header-height",
        `${header.offsetHeight}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(header);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--site-header-height");
    };
  }, []);

  return <span ref={ref} hidden />;
}
