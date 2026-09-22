"use client";

import * as React from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { toast } from "sonner";

import { switchTree } from "@/app/actions/current-tree";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";
import { cn } from "@/lib/utils";

export type SwitcherTree = { id: string; name: string; role: AccountTypeKey };

/**
 * The header's tree switcher, shown only to someone with more than one tree
 * to look at: the current tree's name, and a menu of the others. Picking one
 * remembers it in the browser and opens its canvas.
 */
export function TreeSwitcher({
  trees,
  currentId,
  visiting = null,
}: {
  trees: SwitcherTree[];
  /** The tree being looked at, when it's one of theirs. */
  currentId: string | null;
  /** A tree opened to them from another: read-only, not in `trees`. */
  visiting?: { name: string } | null;
}) {
  const [pending, startTransition] = React.useTransition();
  const current = trees.find((t) => t.id === currentId) ?? null;
  const label = visiting?.name ?? current?.name ?? "Your trees";

  function choose(tree: SwitcherTree) {
    if (tree.id === currentId) return;
    startTransition(async () => {
      const res = await switchTree(tree.id);
      // A successful switch redirects; only a refusal comes back.
      if (res?.error) toast.error(res.error);
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        disabled={pending}
        className="flex min-w-0 max-w-[16rem] items-center gap-1 rounded-md px-2 py-1 text-sm font-semibold tracking-tight text-foreground outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
        aria-label={`Tree: ${label}. Switch tree`}
      >
        <span className="truncate">{label}</span>
        {visiting ? (
          <Badge variant="outline" className="ml-1 shrink-0 font-medium">
            Visiting
          </Badge>
        ) : null}
        <ChevronDownIcon className="size-4 shrink-0 text-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Your trees</DropdownMenuLabel>
          {trees.map((t) => {
            const isCurrent = t.id === currentId;
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
                <span className="min-w-0 flex-1 truncate">{t.name}</span>
                <span className="ml-3 text-xs text-muted-foreground">
                  {accountTypeOf(t.role).name}
                </span>
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
