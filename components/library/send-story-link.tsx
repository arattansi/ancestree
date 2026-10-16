import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { blogSubmitHref } from "@/lib/blog";

/** The way to the form for sending in a story (Step 157), on /library and under each post. */
export function SendStoryLink() {
  return (
    <Link
      href={blogSubmitHref()}
      className="group inline-flex items-center gap-1.5 self-start text-sm underline underline-offset-4 hover:text-muted-foreground"
    >
      Share a story of someone who has passed
      <ArrowRight
        aria-hidden
        className="size-3.5 transition-transform group-hover:translate-x-0.5"
      />
    </Link>
  );
}
