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
 * on privacy and security, pointing to /privacy (Step 195), under its own
 * /data-sovereignty heading since Step 207, which names the export button
 * in settings and the account's delete button. The story has its own
 * /founders heading since Step 208.
 */
export default function AboutUsPage() {
  return (
    <MarketingColumn aside={<OurNodes />}>
      <h1 className="text-2xl font-semibold tracking-tight">(about-us)</h1>
      <h2 className="text-lg font-semibold tracking-tight">/founders</h2>
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
          then got married and then built ancestree.
        </p>
        <p>they still like each other.</p>
        <p>but they used to like each other, too*.</p>
      </MarketingCopy>
      <h2 className="pt-4 text-lg font-semibold tracking-tight">
        /data-sovereignty
      </h2>
      <MarketingCopy>
        <p>
          Raiya and Aalim care a lot about privacy, security, and upholding your
          ownership over your data.
        </p>
        <p>
          they’ve made it easy to take back your data (simple export button) or
          purge your data (simple purge button).
        </p>
        <p>
          they won’t share anything with anyone and are proactively thinking
          about how to protect the people on ancestree. see more at{" "}
          <Link href="/privacy" className="underline underline-offset-4">
            /privacy
          </Link>
          .
        </p>
        <p>it’s your data. they’re just custodians of it.</p>
      </MarketingCopy>
    </MarketingColumn>
  );
}
