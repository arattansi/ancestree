"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { renameTree, setTreeVisibility } from "@/app/actions/trees";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminHref } from "@/lib/tree-links";

/** Rename the tree (Step 25). Its web address follows the name. */
export function AdminTreeName({ treeId, name }: { treeId: string; name: string }) {
  const router = useRouter();
  const [value, setValue] = React.useState(name);
  const [busy, setBusy] = React.useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (value.trim() === name) return;
    setBusy(true);
    const res = await renameTree(treeId, value);
    setBusy(false);
    if (res.error || !res.slug) {
      toast.error(res.error ?? "Couldn't rename the tree.");
      return;
    }
    toast.success("Renamed.");
    router.replace(adminHref(res.slug, "tree-name"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
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
      <Button type="submit" size="sm" disabled={busy || !value.trim() || value.trim() === name}>
        {busy ? "Saving…" : "Rename"}
      </Button>
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
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);

  async function onToggle(viewer: ViewerTreeOption, on: boolean) {
    setBusy(viewer.id);
    const res = await setTreeVisibility(treeId, viewer.id, on);
    setBusy(null);
    if (res.error) toast.error(res.error);
    else toast.success(on ? `Open to ${viewer.name}.` : `Closed to ${viewer.name}.`);
    router.refresh();
  }

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
      {viewers.map((v) => {
        const id = `view-${v.id}`;
        return (
          <li key={v.id} className="flex items-center gap-3 text-sm">
            <Checkbox
              id={id}
              checked={v.visible}
              disabled={busy === v.id}
              onCheckedChange={(on) => onToggle(v, on === true)}
            />
            <Label htmlFor={id} className="font-normal">
              Members of <span className="font-medium">{v.name}</span> can view this tree
            </Label>
          </li>
        );
      })}
    </ul>
  );
}
