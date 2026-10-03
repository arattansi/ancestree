import type { Metadata } from "next";

import { PageColumn } from "@/components/page-column";

export const metadata: Metadata = { title: "capitalism" };

/**
 * /pricing, "capitalism" in the menu (Step 107): its heading is the page's
 * real name, in brackets. Aalim's copy from the Marketing Site page in
 * Notion, word for word and lower-case as he wrote it, in the privacy
 * page's column and type, over the Elevators tree (Step 110).
 */
export default function PricingPage() {
  return (
    <PageColumn>
      <h1 className="text-2xl font-semibold tracking-tight">(pricing)</h1>
      <div className="flex flex-col gap-8 text-sm text-muted-foreground">
        <p>ancestree is in beta, so it’s free to use.</p>
        <p>
          well, it costs us right now. but hey, you need to crack a few eggs
          if you don’t understand metaphors.
        </p>
        <p>
          if it comes out of beta, we’ll probably need to charge something.
        </p>
        <p>
          most of it will be put towards improving ancestree and resisting ad
          revenue.
        </p>
        <p>
          some of it will be put towards us visiting where our ancestors lived.
        </p>
        <p>
          the rest will be used by us to avoid working for companies we don’t
          care about.
        </p>
        <p>
          either way, whatever you grow on ancestree will be stay accessible
          for free.
        </p>
        <p>
          if we do start charging for the ability to continue growing, we’ll
          make it discounted for our beta users.
        </p>
      </div>
    </PageColumn>
  );
}
