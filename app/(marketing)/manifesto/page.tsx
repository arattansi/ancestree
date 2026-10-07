import type { Metadata } from "next";

import { LogoMark } from "@/components/logo-mark";
import {
  MarketingColumn,
  MarketingCopy,
} from "@/components/marketing/marketing-column";

export const metadata: Metadata = { title: "why" };

/**
 * /manifesto, "why" in the menu (Step 107): its heading is the page's real
 * name, in brackets. Aalim's copy from the Marketing Site page in Notion
 * (Step 111 follow-up), word for word, in the about-us page's type. The
 * tiny logos between its parts are his separators, drawn with the header's
 * mark so they have no background of their own.
 */
export default function ManifestoPage() {
  return (
    <MarketingColumn>
      <h1 className="text-2xl font-semibold tracking-tight">
        (product-manifesto)
      </h1>
      <MarketingCopy>
        <p>this isn’t a genealogy tool.</p>
        <p>
          or rather, this isn’t <em>just</em> a genealogy tool.
        </p>
        <p>
          there are many great platforms that allow you to study and chart your
          lines of descent.
        </p>
        <p>
          ancestree is as much about connecting with your family today as it is
          about connecting with your family that has passed.
        </p>
        <p>
          it is about stories and it is about the milestones, celebrations, and
          memories with people that make those stories mean something.
        </p>
        <Separator />
        <p>
          before we got married, we spent a lot of time in our wedding planning
          thinking about our distinct families and the independent histories
          coming together.
        </p>
        <p>our families are very similar and very different.</p>
        <p>our dynamics are very different and very similar.</p>
        <p>
          despite that chaos, each person in our families is someone we are
          connected to and they come from someone else we are connected to.
        </p>
        <p>that connection means something.</p>
        <p>
          whether it’s biological, adoptive, estranged, or just based on
          proximity.
        </p>
        <p>
          when all of those people were together for our wedding, those
          connections became alive in a special way.
        </p>
        <p>
          we weren’t just seeing an uncle for the first time in a long time.
        </p>
        <p>
          we were reconnected with our grandmother’s quirks that we thought we
          lost forever when she passed away.
        </p>
        <p>
          the grief of clinging on to the memory of our grandmother became less
          of a burden.
        </p>
        <p>because we could see how she survived in our uncle.</p>
        <Separator />
        <p>
          these connections mean something to us and we want to nurture them.
        </p>
        <p>
          we built ancestree to be the soil where families can come together to
          grow their tree and nurture those connections.
        </p>
      </MarketingCopy>
    </MarketingColumn>
  );
}

function Separator() {
  return <LogoMark className="size-6 self-center" />;
}
