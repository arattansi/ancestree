import { redirectToDefaultTree } from "@/lib/tree-context";
import { reviewHref } from "@/lib/tree-links";

/** The pre-Step-24 review URL: opens the member's default tree. */
export default async function LegacyReviewPage() {
  await redirectToDefaultTree(reviewHref);
}
