import type { Metadata } from "next";
import type * as React from "react";

import { AccountTypeMark } from "@/components/account-type-badge";
import { ClaimDemo } from "@/components/marketing/claim-demo";
import { DemoQueue } from "@/components/marketing/demo-play";
import {
  LeafDemo,
  LeafDemoForm,
  LeafDemoTree,
} from "@/components/marketing/leaf-demo";
import {
  MarketingCopy,
  MarketingRow,
  MarketingRows,
} from "@/components/marketing/marketing-column";
import { StoryDemo } from "@/components/marketing/story-demo";
import type { AccountTypeKey } from "@/lib/account-types";

export const metadata: Metadata = { title: "what + how" };

/**
 * /features, "what + how" in the menu (Step 107): its heading is the page's
 * real name, in brackets. Under it the add-a-relative form's basic fields
 * and beside them the leaves they make (Step 112), the one demo a visitor
 * can try. Then Aalim's copy from the Marketing Site page in Notion, word
 * for word (Step 115), in parts, two with a moving sample beside them no
 * taller than their words: a leaf invited to be claimed, and a recorded
 * story. The three demos take turns: each starts once the one before has
 * ended, or once it's scrolled to. Newsletter and native lands run the
 * full width. The copy's footnote is on the footer's line (`site-footer.tsx`).
 */
export default function FeaturesPage() {
  return (
    <DemoQueue>
      <MarketingRows>
        <LeafDemo turn={0}>
          <MarketingRow aside={<LeafDemoTree />}>
            <h1 className="text-2xl font-semibold tracking-tight">
              (how-to + features)
            </h1>
            <LeafDemoForm />
          </MarketingRow>
        </LeafDemo>
        <MarketingRow aside={<ClaimDemo turn={1} />} flush>
          <Heading>1. collaborate</Heading>
          <MarketingCopy>
            <p>
              if you’re part of a family, you don’t have to grow your family
              tree alone.
            </p>
            <p>
              like miro or lucidchart*, ancestree is designed to get input with
              and from others. after you add someone to your family tree, invite
              them to join it.
            </p>
            <p>once they join they can add to the tree as well.</p>
          </MarketingCopy>
        </MarketingRow>
        <MarketingRow>
          <Heading>2. account-types</Heading>
          <AccountTypes />
        </MarketingRow>
        <MarketingRow aside={<StoryDemo turn={2} />} flush>
          <Heading>3. stories &amp; albums</Heading>
          <MarketingCopy>
            <p>
              write or upload audio recordings of stories directly to a family
              member’s node. same with pictures that you can tag others in the
              family tree so it shows up in their node’s album too.
            </p>
            <p>
              if a node is claimed, the owner needs to approve stories and
              photos they’re tagged in before it is shared.
            </p>
          </MarketingCopy>
        </MarketingRow>
        <MarketingRow wide>
          <Heading>4. newsletter</Heading>
          <MarketingCopy>
            <p>
              a weekly update on upcoming birthdays, milestones, and additions
              to the trees you are a node in.
            </p>
          </MarketingCopy>
        </MarketingRow>
        <MarketingRow wide>
          <Heading>5. native lands</Heading>
          <MarketingCopy>
            <p>
              those of us privileged enough to spend time and resources to
              compile a family tree are likely occupiers of stolen land.
            </p>
            <p>or you may be residents of a nation that stole land.</p>
            <p>
              or you may be the original inhabitants of land that was stolen
              and/or exploited from your people.
            </p>
            <p>
              or maybe you’re a member of the Sentinelese people in the Andaman
              Islands with no relationship to either side of colonization and
              the oppression, theft, and murder that is endemic to it.
            </p>
            <p>
              whichever it is, we are incredibly grateful to{" "}
              <a
                href="https://native-land.ca/"
                target="_blank"
                rel="noopener noreferrer"
                className="underline underline-offset-2 hover:text-foreground"
              >
                Native Land Digital
              </a>{" "}
              for providing access to “a space where the stories of land and
              waters are carried by those who walk in ancestral relationship
              with them.”
            </p>
          </MarketingCopy>
        </MarketingRow>
      </MarketingRows>
    </DemoQueue>
  );
}

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="text-lg font-semibold tracking-tight">{children}</h2>;
}

const ACCOUNT_TYPES: {
  key: AccountTypeKey;
  name: string;
  what: string;
  who: string;
  limit: string;
}[] = [
  {
    key: "admin",
    name: "root",
    what: "the node that starts the tree and has admin control over it.",
    who: "the one who plans the family reunions.",
    limit: "up to 2 roots per tree",
  },
  {
    key: "branch_admin",
    name: "branch",
    what: "the node given admin control over their branch to the root.",
    who: "the one that knows everything about the family.",
    limit: "up to 4 branches per root",
  },
  {
    key: "member",
    name: "leaf",
    what: "base node. can add to their branch and view the whole tree.",
    who: "everyone else.",
    limit: "no limit",
  },
];

/** Aalim's table: a column a type, its mark (the one under a leaf) by its name. */
function AccountTypes() {
  return (
    <table className="w-full table-fixed border-collapse text-left text-sm">
      <thead>
        <tr>
          {ACCOUNT_TYPES.map((t) => (
            <th
              key={t.key}
              scope="col"
              className="border-b pr-4 pb-2 align-bottom font-semibold"
            >
              <span className="flex items-center gap-1.5">
                <AccountTypeMark typeKey={t.key} className="size-5 shrink-0" />
                {t.name}
              </span>
            </th>
          ))}
        </tr>
      </thead>
      <tbody className="text-muted-foreground">
        <tr>
          {ACCOUNT_TYPES.map((t) => (
            <td key={t.key} className="border-b py-2 pr-4 align-top">
              {t.what}
            </td>
          ))}
        </tr>
        <tr>
          {ACCOUNT_TYPES.map((t) => (
            <td key={t.key} className="border-b py-2 pr-4 align-top">
              {t.who}
            </td>
          ))}
        </tr>
        <tr>
          {ACCOUNT_TYPES.map((t) => (
            <td key={t.key} className="py-2 pr-4 align-top">
              {t.limit}
            </td>
          ))}
        </tr>
      </tbody>
    </table>
  );
}
