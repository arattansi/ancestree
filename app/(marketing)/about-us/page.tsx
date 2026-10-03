import type { Metadata } from "next";

import { MarketingColumn } from "@/components/marketing/marketing-column";
import { OurNodes } from "@/components/marketing/our-nodes";

export const metadata: Metadata = { title: "who" };

/**
 * /about-us, "who" in the menu (Step 107): its heading is the page's real
 * name, in brackets. Aalim's copy and layout from the Marketing Site page
 * in Notion (Step 111 follow-up), word for word, in the privacy page's
 * type: the story right under the heading, and Raiya's and Aalim's leaves
 * joined to their wedding photo beside it (under it on a phone). Its
 * column is the other marketing pages' too (`MarketingColumn`). The
 * story's footnote is on the footer's line (`site-footer.tsx`).
 */
export default function AboutUsPage() {
  return (
    <MarketingColumn aside={<OurNodes />}>
      <h1 className="text-2xl font-semibold tracking-tight">(about-us)</h1>
      <div className="flex flex-col gap-8 text-sm text-muted-foreground">
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
          Raiya and Aalim met and then liked each other and then got married and
          then built ancestree.space.
        </p>
        <p>they still like each other.</p>
        <p>but they used to like each other, too*.</p>
      </div>
    </MarketingColumn>
  );
}
