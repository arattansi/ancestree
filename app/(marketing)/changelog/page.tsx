import type { Metadata } from "next";
import Link from "next/link";

import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { CHANGELOG, changelogHref, changelogId } from "@/lib/changelog";
import { marketingMetadata } from "@/lib/marketing-meta";
import { shortDate } from "@/lib/short-date";

export const metadata: Metadata = {
  ...marketingMetadata(
    "ancestree • changelog",
    "every update to ancestree, dated, newest first.",
  ),
  alternates: {
    types: { "application/rss+xml": `${changelogHref()}/feed.xml` },
  },
};

/**
 * /changelog (Step 191): what shipped on ancestree and when, newest first,
 * from `lib/changelog.ts`, so a visitor or a crawler can see it's alive
 * and moving. Linked from the home page's footer, in the sitemap, and
 * followed by RSS. Its heading in brackets, as the other marketing pages'.
 * Each entry has its date's anchor, to link to one update.
 */
export default function ChangelogPage() {
  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">(changelog)</h1>
      <MarketingCopy>
        <p>
          every update to ancestree, newest first. follow it by{" "}
          <Link
            href={`${changelogHref()}/feed.xml`}
            className="underline underline-offset-2 hover:text-foreground"
          >
            RSS
          </Link>
          .
        </p>
      </MarketingCopy>
      <ol className="flex flex-col gap-8">
        {CHANGELOG.map((entry) => {
          const id = changelogId(entry);
          return (
            <li key={id}>
              <article id={id} className="flex scroll-mt-24 flex-col gap-2">
                <time
                  dateTime={entry.date}
                  className="text-xs text-muted-foreground"
                >
                  {shortDate(entry.date)}
                </time>
                <h2 className="text-base font-medium">
                  <a href={`#${id}`} className="hover:underline underline-offset-2">
                    {entry.title}
                  </a>
                </h2>
                <ul className="flex list-disc flex-col gap-1 pl-4 text-sm text-muted-foreground">
                  {entry.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </article>
            </li>
          );
        })}
      </ol>
    </MarketingColumn>
  );
}
