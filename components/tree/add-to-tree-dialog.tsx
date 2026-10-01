"use client";

import { TreeTarget } from "@/components/tree-target";
import { TreeMarkDot } from "@/components/tree/tree-mark";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { FamilyViewTree } from "@/lib/my-family";

/**
 * "Which tree do you want to add to?" (Step 92.3): My Family Tree adds
 * nothing itself, so its "Add a relative" asks which of the member's trees
 * the relative goes on, then opens the add flow there. The tree the
 * browser remembers opens as a link; another is switched to first. Its
 * own module, fetched after the canvas has painted (Step 87.4).
 */
export function AddToTreeDialog({
  open,
  onOpenChange,
  trees,
  currentTreeId,
  href,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trees it may go on, in the key's order. */
  trees: FamilyViewTree[];
  /** The tree the browser remembers. */
  currentTreeId: string | null;
  /** The add flow, connected to whoever it's a relative of. */
  href: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>Which tree do you want to add to?</DialogTitle>
        <ul className="flex flex-col gap-2">
          {trees.map((t) => (
            <li key={t.id}>
              <TreeTarget
                treeId={t.id}
                currentTreeId={currentTreeId}
                href={href}
                variant="outline"
                className="h-auto min-h-11 w-full justify-start px-3 py-2 text-left whitespace-normal"
              >
                {/* One child: the link wraps what it's given in one label. */}
                <span className="flex min-w-0 items-center gap-2.5">
                  <TreeMarkDot mark={t.mark} />
                  <span className="min-w-0 break-words">{t.name}</span>
                </span>
              </TreeTarget>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
