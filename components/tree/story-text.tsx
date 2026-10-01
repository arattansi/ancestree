"use client";

import * as React from "react";

// Markdown's renderer is a few dozen KB, so it loads once a story is shown
// rather than with the canvas (Step 87.4); the text shows plain until it has.
const StoryMarkdown = React.lazy(() =>
  import("@/components/story-markdown").then((m) => ({ default: m.StoryMarkdown })),
);

/** A story's text, drawn as Markdown (Step 99). */
export function StoryText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <React.Suspense
      fallback={<p className="leading-relaxed whitespace-pre-wrap">{children}</p>}
    >
      <StoryMarkdown className={className}>{children}</StoryMarkdown>
    </React.Suspense>
  );
}
