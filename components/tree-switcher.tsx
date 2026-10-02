"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CheckIcon, ChevronDownIcon, Sprout, UsersRound } from "lucide-react";

import { switchTree } from "@/app/actions/current-tree";
import { AccountTypeGlyph } from "@/components/account-type-badge";
import { useStartTree } from "@/components/start-tree-button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAction } from "@/components/use-action";
import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";
import { myFamilyHref, treeHref } from "@/lib/tree-links";
import type { TreeRequestStatus } from "@/lib/tree-requests";
import { cn } from "@/lib/utils";

export type SwitcherTree = { id: string; name: string; role: AccountTypeKey };

/**
 * What My Family Tree is called in the menu. The button says it
 * lower-case, as every button does (Step 102).
 */
const MY_FAMILY_TREE = "My Family Tree";

/** What starting a tree says in the menu, by where the ask stands. */
const START_TREE_LABEL: Record<TreeRequestStatus, string> = {
  none: "Ask to start a tree",
  pending: "Asked to start a tree",
  approved: "Start a tree",
  founded: "",
};

/**
 * The header's tree switcher, for every member (Step 92.2; only those with
 * two trees or more before): what they're looking at, and a menu of My
 * Family Tree first, then each of their trees with their account type's
 * mark there, then — until they've founded one — starting a tree of their
 * own, at whatever stage their ask is (Step 28). Picking a tree remembers
 * it in the browser and opens its canvas; My Family Tree has an address of
 * its own, and leaves the remembered tree alone. From My Family Tree a tree
 * is always switched to, even the one shown by default, so the choice holds
 * for the rest of the visit (Step 92.5).
 */
export function TreeSwitcher({
  trees,
  currentId,
  chosen,
  visiting = null,
  myFamily,
  startTree,
}: {
  trees: SwitcherTree[];
  /** The tree being looked at, when it's one of theirs. */
  currentId: string | null;
  /** `currentId` was switched to this visit, not shown by default. */
  chosen: boolean;
  /** A tree opened to them from another: read-only, not in `trees`. */
  visiting?: { name: string } | null;
  /** They have an entry of their own to arrange My Family Tree around. */
  myFamily: boolean;
  /** Where their ask to start a tree stands; `founded` offers nothing. */
  startTree: TreeRequestStatus;
}) {
  const router = useRouter();
  const action = useAction();
  const start = useStartTree(startTree);
  const [opening, startOpening] = React.useTransition();
  const onFamily = usePathname() === myFamilyHref();
  const current = trees.find((t) => t.id === currentId) ?? null;
  const label = onFamily
    ? "my family tree"
    : (visiting?.name ?? current?.name ?? "your trees");
  const busy = action.pending || opening || start.pending;

  function open(href: string) {
    // Busy until the page has arrived, as a switch is.
    startOpening(() => router.push(href));
  }

  function choose(tree: SwitcherTree) {
    if (tree.id === currentId && !onFamily) return;
    if (tree.id === currentId && chosen) {
      // From My Family Tree, the tree switched to this visit: its canvas.
      open(treeHref());
      return;
    }
    // A switch redirects, and the menu stays busy until the tree has opened;
    // only a refusal comes back.
    action.run("switch", () => switchTree(tree.id));
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          disabled={busy}
          className="relative flex min-w-0 max-w-[16rem] items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold tracking-tight text-foreground outline-none tap-target hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
          aria-label={`Tree: ${label}. Switch tree`}
        >
          <span className="truncate">{label}</span>
          {visiting && !onFamily ? (
            <Badge variant="outline" className="ml-1 shrink-0 font-medium">
              Visiting
            </Badge>
          ) : null}
          <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-56">
          {myFamily ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem
                  onClick={() => {
                    if (!onFamily) open(myFamilyHref());
                  }}
                  aria-current={onFamily ? "true" : undefined}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      onFamily ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  <UsersRound className="size-4" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {MY_FAMILY_TREE}
                  </span>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuGroup>
            <DropdownMenuLabel>Your trees</DropdownMenuLabel>
            {trees.map((t) => {
              const isCurrent = !onFamily && t.id === currentId;
              const type = accountTypeOf(t.role);
              return (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => choose(t)}
                  aria-current={isCurrent ? "true" : undefined}
                >
                  <CheckIcon
                    className={cn(
                      "size-4",
                      isCurrent ? "opacity-100" : "opacity-0",
                    )}
                    aria-hidden
                  />
                  {/* Their account type there, as its mark (Step 92.2). */}
                  <span title={type.name} className="flex">
                    <AccountTypeGlyph type={type} tinted />
                  </span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.name}
                    <span className="sr-only">, {type.name}</span>
                  </span>
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuGroup>
          {start.current !== "founded" ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={start.start}>
                <span className="size-4" aria-hidden />
                <Sprout className="size-4 text-muted-foreground" aria-hidden />
                <span className="min-w-0 flex-1 truncate">
                  {START_TREE_LABEL[start.current]}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* Outside the menu, which is gone by the time an ask is in. */}
      {start.dialog}
    </>
  );
}
