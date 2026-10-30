import type { Metadata } from "next";
import { cache } from "react";

import { CardLinkSigning } from "@/components/birthday-card/card-link";
import { EnvelopeMark } from "@/components/birthday-card/envelope-mark";
import { CenteredPage, PageColumn } from "@/components/page-column";
import { cardDay, possessive } from "@/lib/birthday-cards";
import { isCardLinkToken, pronounOf } from "@/lib/card-links";
import { loadCardLinkPage } from "@/lib/card-links.server";

const NOT_INDEXED = { index: false, follow: false };

/** One read a request, for the page and what a chat shows of the link. */
const readPage = cache(async (token: string) =>
  isCardLinkToken(token) ? loadCardLinkPage(token) : null,
);

export async function generateMetadata({ params }: PageProps<"/c/[token]">): Promise<Metadata> {
  const page = await readPage((await params).token);
  if (page?.state !== "live") return { title: "a birthday card", robots: NOT_INDEXED };
  // What a chat shows of the link before it's opened: a first name and the
  // day, as the page does.
  const title = `sign ${possessive(page.firstName)} card`;
  const description = `${possessive(page.firstName)} birthday is on ${cardDay(page.opensOn)}. Sign ${pronounOf(page.sex)} card on ancestree.`;
  return {
    title,
    description,
    robots: NOT_INDEXED,
    openGraph: { type: "website", siteName: "ancestree", title, description },
  };
}

/**
 * A birthday card's link (Step 217.3): whoever holds it signs, signed in as
 * themself or signed out with their name. It shows only the person's first
 * name, the day, their leaf and who's collecting, their photo unless they
 * hide their entry from visitors (Step 215's calls on a link holder); the
 * others' signatures once the visitor has signed. The person themself,
 * signed in, sees nothing but the day.
 */
export default async function SignCardPage({ params }: PageProps<"/c/[token]">) {
  const page = await readPage((await params).token);

  if (!page || page.state === "gone") {
    return (
      <CenteredPage>
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <EnvelopeMark className="h-[42px] w-[60px]" />
          <h1 className="text-xl font-bold">this link no longer works.</h1>
          <p className="text-[15px] text-muted-foreground">ask whoever sent it for a new one.</p>
        </div>
      </CenteredPage>
    );
  }

  if (page.state === "peek") {
    return (
      <CenteredPage>
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <EnvelopeMark className="h-[42px] w-[60px]" />
          <h1 className="text-xl font-bold">no peeking.</h1>
          <p className="text-[15px] text-muted-foreground">it opens on {cardDay(page.opensOn)}.</p>
        </div>
      </CenteredPage>
    );
  }

  return (
    <PageColumn width="lg" className="py-8">
      <CardLinkSigning page={page} />
    </PageColumn>
  );
}
