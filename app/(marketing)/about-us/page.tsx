import type { Metadata } from "next";
import Link from "next/link";

import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";
import { OurNodes } from "@/components/marketing/our-nodes";
import { marketingMetadata } from "@/lib/marketing-meta";

export const metadata: Metadata = marketingMetadata(
  "ancestree • about-us",
  "spoiler: our families matter to us.",
);

/**
 * /about-us, "who" in the menu (Step 107): its heading is the page's real
 * name, in brackets. Aalim's copy and layout from the Marketing Site page
 * in Notion (Step 111 follow-up), word for word, in the privacy page's
 * type: the story right under the heading, and Raiya's and Aalim's leaves
 * joined to their wedding photo beside it (under it on a phone). Its
 * column is the other marketing pages' too (`MarketingColumn`). The
 * story's footnote is on the footer's line (`site-footer.tsx`). It ends
 * on privacy and security, pointing to /privacy (Step 195).
 */
export default function AboutUsPage() {
  return (
    <MarketingColumn aside={<OurNodes />}>
      <h1 className="text-2xl font-semibold tracking-tight">(about-us)</h1>
      <MarketingCopy>
        <p>
          Raiya grew up in the lower mainland of British Columbia and was raised
          very close to her grandparents and extended family.
        </p>
        <p>
          they told her a lot of stories about her family’s migration from India
          to East Africa to Canada.
        </p>
        <p>
          Aalim grew up in the greater Toronto-area of Ontario and was raised
          very close to his grandparents and extended family.
        </p>
        <p>
          they told him a lot of stories about his family’s migration from India
          to East Africa to Canada.
        </p>
        <p>
          Raiya and Aalim met in Hamilton, Ontario and then liked each other and
          then got married and then built ancestree.space.
        </p>
        <p>they still like each other.</p>
        <p>but they used to like each other, too*.</p>
        <p>they also care a lot about privacy and security.</p>
        <p>
          they won’t share anything with anyone and are proactively thinking
          about how to protect the people on ancestree. see more at{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            /privacy
          </Link>
        </p>
      </MarketingCopy>
    </MarketingColumn>
  );
}
