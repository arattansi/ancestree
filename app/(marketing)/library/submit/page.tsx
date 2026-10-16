import type { Metadata } from "next";

import { LibraryBackLink } from "@/components/library/library-back-link";
import { SubmitStoryForm } from "@/components/library/submit-story-form";
import { MarketingColumn } from "@/components/marketing/marketing-column";
import { BLOG_NAME } from "@/lib/blog";

export const metadata: Metadata = {
  title: `Send us their story · ${BLOG_NAME}`,
  description: `Send the story of someone your family has lost, to be published in ${BLOG_NAME} on ancestree.`,
};

/**
 * /library/submit (Step 157): anyone, signed in or not, sends in the
 * story of someone who has passed, for the beta reviewers to edit and
 * publish in the library. A copy goes to the email they give.
 */
export default function SubmitStoryPage() {
  return (
    <MarketingColumn>
      <LibraryBackLink />
      <h1 className="text-2xl font-semibold tracking-tight">Send Us Their Story</h1>
      <SubmitStoryForm />
    </MarketingColumn>
  );
}
