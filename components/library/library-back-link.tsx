import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { BLOG_NAME, blogHref } from "@/lib/blog";

/**
 * The way back to the library from a page under it (Step 157): its name
 * after an arrow pointing back, so it reads as where the link goes, not as
 * the page's own heading.
 */
export function LibraryBackLink() {
  return (
    <Link
      href={blogHref()}
      aria-label={`Back to ${BLOG_NAME}`}
      className="group inline-flex items-center gap-1.5 self-start text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
    >
      <ArrowLeft
        aria-hidden
        className="size-3.5 transition-transform group-hover:-translate-x-0.5"
      />
      ({BLOG_NAME})
    </Link>
  );
}
