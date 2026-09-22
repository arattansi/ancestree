import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTreeById, redirectToDefaultTree } from "@/lib/tree-context";
import { editPersonHref } from "@/lib/tree-links";

/** The pre-Step-24 edit URL: opens the entry from its home tree. */
export default async function LegacyEditPersonPage({
  params,
}: PageProps<"/people/[id]/edit">) {
  const { id } = await params;
  await requireProfile();
  const supabase = await createClient();
  const { data: person } = await supabase
    .from("people")
    .select("tree_id")
    .eq("id", id)
    .maybeSingle();
  const home = person ? await getTreeById(person.tree_id) : null;
  if (home) redirect(editPersonHref(home.slug, id));
  await redirectToDefaultTree((slug) => editPersonHref(slug, id));
}
