"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { renameTree, setTreeVisibility } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { adminHref } from "@/lib/tree-links";

/** Rename the tree (Step 25). Its web address follows the name. */
export function AdminTreeName({ treeId, name }: { treeId: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(name);
  const action = useAction({ inline: true });

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (value.trim() === name) return;
    action.run(
      "rename",
      async () => {
        const res = await renameTree(treeId, value);
        if (!res.error && !res.slug) return { error: "Couldn't rename the tree." };
        return res;
      },
      { onSuccess: () => router.replace(adminHref("tree-name")) },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor="tree-name">Tree name</Label>
          <Input
            id="tree-name"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={80}
            required
          />
        </div>
        <PendingButton
          type="submit"
          size="sm"
          pending={action.pending}
          pendingLabel="Saving…"
          disabled={!value.trim() || value.trim() === name}
        >
          Rename
        </PendingButton>
      </div>
      <FormError>{action.error}</FormError>
    </form>
  );
}

export type ViewerTreeOption = {
  id: string;
  name: string;
  /** Members of this tree can already see ours. */
  visible: boolean;
};

/**
 * Open this tree, read-only, to the members of another tree the Root belongs
 * to (Step 25.4). They reach it from a shared person's card; entries marked
 * hidden are blurred to them.
 */
export function AdminTreeVisibility({
  treeId,
  viewers,
}: {
  treeId: string;
  viewers: ViewerTreeOption[];
}) {
  if (viewers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        You&rsquo;re not on another tree, so there&rsquo;s nobody to open this
        one to yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {viewers.map((v) => (
        <ViewerRow key={v.id} treeId={treeId} viewer={v} />
      ))}
    </ul>
  );
}

/**
 * One tree's box, with its own call: it ticks as it's pressed, and goes back
 * by itself if the change doesn't take.
 */
function ViewerRow({ treeId, viewer }: { treeId: string; viewer: ViewerTreeOption }) {
  const action = useAction();
  const [visible, setVisible] = React.useOptimistic(viewer.visible);
  const id = `view-${viewer.id}`;

  return (
    <li className="flex items-center gap-3 text-sm">
      <Checkbox
        id={id}
        checked={visible}
        disabled={action.pending}
        onCheckedChange={(on) =>
          action.run("visible", async () => {
            setVisible(on === true);
            return setTreeVisibility(treeId, viewer.id, on === true);
          })
        }
      />
      <Label htmlFor={id} className="font-normal">
        Members of <span className="font-medium">{viewer.name}</span> can view this tree
      </Label>
    </li>
  );
}
