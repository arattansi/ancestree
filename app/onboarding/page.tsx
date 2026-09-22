import { redirectToDefaultTree } from "@/lib/tree-context";
import { onboardingHref } from "@/lib/tree-links";

/** The pre-Step-24 onboarding URL: opens the member's default tree. */
export default async function LegacyOnboardingPage() {
  await redirectToDefaultTree(onboardingHref);
}
