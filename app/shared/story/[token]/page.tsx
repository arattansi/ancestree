import type { Metadata } from "next";
import Link from "next/link";

import { CenteredPage, PageColumn } from "@/components/page-column";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth";
import { resolveStoryLink } from "@/lib/story-links.server";
import { storyHref } from "@/lib/tree-links";

const NOT_INDEXED = { index: false, follow: false };

export async function generateMetadata({
  params,
}: PageProps<"/shared/story/[token]">): Promise<Metadata> {
  const story = await resolveStoryLink((await params).token);
  if (!story) return { title: "story", robots: NOT_INDEXED };
  // What a chat shows of the link before it's opened.
  const title = story.title ?? `a story about ${story.personName}`;
  const description = `A story about ${story.personName}, shared by ${story.sharedBy}.`;
  return {
    title,
    description,
    robots: NOT_INDEXED,
    openGraph: { type: "article", siteName: "ancestree", title, description },
  };
}

/**
 * A story shared by its public link (Step 88.4): read-only, with no account
 * needed. It shows the story, who it's about and who shared it; its
 * comments are for members, who sign in to reach them.
 */
export default async function SharedStoryPage({
  params,
}: PageProps<"/shared/story/[token]">) {
  const [story, viewer] = await Promise.all([
    resolveStoryLink((await params).token),
    getSessionUser(),
  ]);

  if (!story) {
    return (
      <CenteredPage>
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Link not available</CardTitle>
            <CardDescription>It may have been turned off.</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              <Link href="/" className="underline underline-offset-4">
                Back home
              </Link>
            </p>
          </CardContent>
        </Card>
      </CenteredPage>
    );
  }

  return (
    <PageColumn width="lg">
      <article className="flex flex-col gap-5">
        <header className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            {story.title ?? `A story about ${story.personName}`}
          </h1>
          <p className="text-sm text-muted-foreground">
            {story.title ? `About ${story.personName} · ` : null}
            Shared by {story.sharedBy}
          </p>
        </header>
        {story.body ? (
          <p className="whitespace-pre-wrap leading-relaxed">{story.body}</p>
        ) : null}
        {story.audioUrl ? (
          <audio controls preload="none" src={story.audioUrl} className="w-full" />
        ) : null}
      </article>
      <p className="border-t border-border pt-4 text-sm text-muted-foreground">
        {/* A plain link: where it goes is worked out when it's followed. */}
        <a
          href={storyHref(story.storyId)}
          className="font-medium text-foreground underline underline-offset-4"
        >
          {viewer ? "See the comments" : "Sign in to see the comments"}
        </a>
      </p>
    </PageColumn>
  );
}
