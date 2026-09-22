import { TreeBar } from "@/components/tree-bar";
import { countAdminActionItems } from "@/lib/admin-notifications";
import { countOpenConnectionSuggestions } from "@/lib/connection-suggestions.server";
import { listMyTrees, requireTreeAccess } from "@/lib/tree-context";

/**
 * Everything under `/t/<slug>/` is one tree (Step 25). The layout settles
 * who the viewer is on it — a member with an account type there, or a
 * visitor from a tree it was opened to — and draws the tree bar: which tree
 * this is, the others they belong to, and the tree's own pages.
 */
export default async function TreeLayout({
  children,
  params,
}: LayoutProps<"/t/[slug]">) {
  const { slug } = await params;
  const access = await requireTreeAccess(slug);
  const trees = await listMyTrees();
  const options = trees.map((t) => ({ id: t.id, name: t.name, slug: t.slug }));

  if (access.kind === "visitor") {
    return (
      <>
        <TreeBar
          tree={access.visit.tree}
          role={null}
          viaTreeName={access.visit.viaTree?.name ?? null}
          trees={options}
          adminItems={0}
          openConnections={0}
        />
        {children}
      </>
    );
  }

  const { membership } = access;
  const [adminItems, openConnections] = await Promise.all([
    membership.isRoot ? countAdminActionItems(membership.tree.id) : 0,
    // A Leaf can't answer connection prompts, so isn't pointed at them.
    membership.type.connections !== "none"
      ? countOpenConnectionSuggestions(membership.tree.id)
      : 0,
  ]);

  return (
    <>
      <TreeBar
        tree={membership.tree}
        role={membership.role}
        trees={options}
        adminItems={adminItems}
        openConnections={openConnections}
      />
      {children}
    </>
  );
}
