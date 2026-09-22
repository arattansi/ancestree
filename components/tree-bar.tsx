import Link from "next/link";
import { ChevronDownIcon } from "lucide-react";

import { AccountTypeBadge } from "@/components/account-type-badge";
import { SiteNavLink } from "@/components/site-nav-link";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";
import {
  adminHref,
  newTreeHref,
  reviewHref,
  treeHref,
  treesHref,
} from "@/lib/tree-links";

type TreeOption = { id: string; name: string; slug: string };

/**
 * The strip under the site header on every tree page (Step 25): which tree
 * this is and the viewer's account type on it, a switch to their other trees,
 * and the tree's own pages. The site header above it stays the same on every
 * tree, so nothing there has to know where you are.
 */
export function TreeBar({
  tree,
  role,
  viaTreeName = null,
  trees,
  adminItems,
  openConnections,
}: {
  tree: TreeOption;
  /** The viewer's account type here, or `null` for a visitor (Step 25.4). */
  role: AccountTypeKey | null;
  /** For a visitor: the tree of theirs this one was opened to. */
  viaTreeName?: string | null;
  trees: TreeOption[];
  adminItems: number;
  openConnections: number;
}) {
  const type = role ? accountTypeOf(role) : null;
  const others = trees.filter((t) => t.id !== tree.id);

  return (
    <div className="border-b border-border bg-muted/40">
      <div className="mx-auto flex min-h-11 w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-1">
        <div className="flex min-w-0 items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger className="flex min-w-0 items-center gap-1 rounded-sm text-sm font-semibold tracking-tight text-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring">
              <span className="truncate">{tree.name}</span>
              <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {others.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  render={<Link href={treeHref(t.slug)} />}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
              {others.length > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem render={<Link href={treesHref()} />}>
                All your trees
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href={newTreeHref()} />}>
                Start a tree of your own
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {role ? (
            <AccountTypeBadge role={role} />
          ) : (
            <Badge variant="outline" title={viaTreeName ? `Opened to ${viaTreeName}` : undefined}>
              Visiting
            </Badge>
          )}
        </div>
        <nav aria-label="This tree" className="flex flex-wrap items-center gap-2">
          <SiteNavLink href={treeHref(tree.slug)}>tree</SiteNavLink>
          {openConnections > 0 ? (
            <SiteNavLink href={reviewHref(tree.slug)}>
              connections
              <Badge variant="secondary" className="ml-1.5">
                {openConnections}
              </Badge>
            </SiteNavLink>
          ) : null}
          {type?.runsTree ? (
            <SiteNavLink href={adminHref(tree.slug)}>
              admin
              {adminItems > 0 ? (
                <Badge variant="destructive" className="ml-1.5">
                  {adminItems}
                </Badge>
              ) : null}
            </SiteNavLink>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
