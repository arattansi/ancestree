import { redirectToDefaultTree } from "@/lib/tree-context";
import { adminHref } from "@/lib/tree-links";

/** The pre-Step-24 admin URL: opens the member's default tree. */
export default async function LegacyAdminPage() {
  await redirectToDefaultTree((slug) => adminHref(slug));
}
