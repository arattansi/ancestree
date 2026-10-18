import type { Metadata } from "next";

import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { marketingMetadata } from "@/lib/marketing-meta";

export const metadata: Metadata = marketingMetadata(
  "ancestree • pricing",
  "good jokes on this page.",
);

/**
 * /pricing, "capitalism" in the menu (Step 107): its heading is the page's
 * real name, in brackets. Aalim's copy from the Marketing Site page in
 * Notion, word for word and lower-case as he wrote it, in about-us's
 * column and type, over the Elevators tree (Step 110).
 */
export default function PricingPage() {
  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">(pricing)</h1>
      <MarketingCopy>
        <p>ancestree is free to use.</p>
        <p>
          well, it costs us for you to use it. but hey, you need to crack a few
          eggs if you don’t understand metaphors.
        </p>
        <p>eventually, we’ll probably need to charge something.</p>
        <p>
          mostly because we are more likely to shut down ancestree than
          commodify you to generate ad revenue.
        </p>
        <p>
          the majority of what we charge will be put towards sustaining and
          improving ancestree.
        </p>
        <p>
          some of it will be put towards us visiting where our ancestors lived.
        </p>
        <p>
          the rest will be used by us to avoid working for companies we don’t
          care about.
        </p>
        <p>
          either way, whatever you grow on ancestree will stay accessible for
          free and it will remain easy to take back your data.
        </p>
        <p>
          if we do start charging for the ability to continue growing, we’ll
          make it discounted for our early users.
        </p>
      </MarketingCopy>
    </MarketingColumn>
  );
}
