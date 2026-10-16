import type { Metadata } from "next";
import Link from "next/link";

import { ChangeRequestForm } from "@/components/library/change-request-form";
import { LibraryBackLink } from "@/components/library/library-back-link";
import { MarketingColumn, MarketingCopy } from "@/components/marketing/marketing-column";
import { Badge } from "@/components/ui/badge";
import { BLOG_KIND_LABEL, BLOG_NAME, blogPostHref } from "@/lib/blog";
import { peopleNames } from "@/lib/library-submissions";
import { readSentStory } from "@/lib/library-submissions.server";
import { shortDate } from "@/lib/short-date";

export const metadata: Metadata = {
  title: `Your story · ${BLOG_NAME}`,
  robots: { index: false },
};

/**
 * A story sent in, as the link in its copy opens it (Step 157): what was
 * sent, word for word, the changes asked for so far, and a box to ask for
 * another, which the beta reviewers triage on the admin page. The link is
 * the only key, so it says nothing about anyone else's.
 */
export default async function SentStoryPage({
  params,
}: PageProps<"/library/submissions/[token]">) {
  const { token } = await params;
  const story = await readSentStory(token);

  if (!story) {
    return (
      <MarketingColumn>
        <LibraryBackLink />
        <h1 className="text-2xl font-semibold tracking-tight">Link Not Found</h1>
        <MarketingCopy>
          <p>This link doesn’t work.</p>
        </MarketingCopy>
      </MarketingColumn>
    );
  }

  const who = peopleNames(story.people);
  return (
    <MarketingColumn>
      <LibraryBackLink />
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Your Story</h1>
        <p className="text-sm text-muted-foreground">
          Sent {shortDate(story.createdAt)}
          {story.publishedSlug ? (
            <>
              {" · "}
              <Link
                href={blogPostHref(story.publishedSlug)}
                className="underline underline-offset-4 hover:text-foreground"
              >
                Published
              </Link>
            </>
          ) : null}
        </p>
      </div>

      <article className="flex flex-col gap-3 rounded-xl border p-4 text-sm">
        <h2 className="text-lg font-semibold tracking-tight break-words">{story.title}</h2>
        <p className="text-muted-foreground">
          {BLOG_KIND_LABEL[story.kind]}
          {who ? `: ${who}` : ""}
        </p>
        {story.photoUrl ? (
          // A signed address for an hour, not for next/image to cache.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={story.photoUrl}
            alt=""
            className="max-h-80 self-start rounded-md border object-cover"
          />
        ) : null}
        <p className="whitespace-pre-wrap break-words text-muted-foreground">{story.body}</p>
      </article>

      {story.changeRequests.length ? (
        <ul className="flex flex-col gap-2 text-sm">
          {story.changeRequests.map((r) => (
            <li key={r.id} className="flex flex-col gap-1 rounded-md border border-dashed p-3">
              <p className="whitespace-pre-wrap break-words">{r.message}</p>
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                Asked {shortDate(r.createdAt)}
                {r.resolvedAt ? <Badge variant="secondary">Done</Badge> : null}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      <ChangeRequestForm token={token} />
    </MarketingColumn>
  );
}
