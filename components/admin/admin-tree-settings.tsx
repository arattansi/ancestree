"use client";

import * as React from "react";

import { renameTree, setTreeVisibility } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { TREE_NAME_MAX } from "@/lib/limits";

/**
 * Rename the tree (Step 25), from the Root console's Settings card (Step
 * 109; settings' card per tree from Step 103.2). The action refreshes the
 * page, so the new name shows wherever the old did.
 */
export function AdminTreeName({ treeId, name }: { treeId: string; name: string }) {
  const [value, setValue] = React.useState(name);
  const inputId = React.useId();
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
      { success: "Tree renamed." },
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-2">
          <Label htmlFor={inputId}>Tree name</Label>
          <Input
            id={inputId}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            maxLength={TREE_NAME_MAX}
            required
          />
        </div>
        <PendingButton
          type="submit"
          size="sm"
          pending={action.pending}
          pendingLabel="saving…"
          disabled={!value.trim() || value.trim() === name}
        >
          rename
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
  // A Root running two trees has a list on each tree's card.
  const id = `view-${treeId}-${viewer.id}`;

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
