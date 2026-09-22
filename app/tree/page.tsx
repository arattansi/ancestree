import { redirectToDefaultTree } from "@/lib/tree-context";
import { treeFocusHref } from "@/lib/tree-links";

/** The pre-Step-24 canvas URL: opens the member's default tree. */
export default async function LegacyTreePage({
  searchParams,
}: PageProps<"/tree">) {
  const { person } = await searchParams;
  await redirectToDefaultTree((slug) =>
    treeFocusHref(slug, typeof person === "string" ? person : null),
  );
}
