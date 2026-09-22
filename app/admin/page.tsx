import { redirect } from "next/navigation";

import { adminHref } from "@/lib/tree-links";

/** The old admin URL: the console is the account page's Admin view now. */
export default function LegacyAdminPage() {
  redirect(adminHref());
}
