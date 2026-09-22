import { redirectToDefaultTree } from "@/lib/tree-context";
import { addRelativeHref } from "@/lib/tree-links";

/** The pre-Step-24 add URL: opens the flow on the member's default tree. */
export default async function LegacyNewPersonPage({
  searchParams,
}: PageProps<"/people/new">) {
  const { relatedTo } = await searchParams;
  await redirectToDefaultTree((slug) =>
    addRelativeHref(slug, typeof relatedTo === "string" ? relatedTo : null),
  );
}
