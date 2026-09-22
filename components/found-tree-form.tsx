"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { foundTree } from "@/app/actions/trees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { adminHref } from "@/lib/tree-links";

/**
 * "Start a tree of your own" (Step 25): a name, and the member becomes the
 * first Root of a fresh tree. They then bring people over from the trees
 * they belong to on its admin console, which is where this lands — the new
 * tree is the current one from here on.
 */
export function FoundTreeForm({ suggestedName }: { suggestedName: string }) {
  const router = useRouter();
  const [name, setName] = React.useState(suggestedName);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    const res = await foundTree(name);
    setPending(false);
    if (res.error || !res.slug) {
      setError(res.error ?? "Couldn't start your tree.");
      return;
    }
    toast.success("Your tree is planted.");
    router.push(adminHref("placements"));
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="tree-name">Name your tree</Label>
        <Input
          id="tree-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          autoComplete="off"
          required
        />
        <p className="text-xs text-muted-foreground">
          Call it whatever you like — the family name, say. You can rename it
          any time from its admin console; the web address follows the name.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending || !name.trim()}>
        {pending ? "Planting…" : "Start my tree"}
      </Button>
    </form>
  );
}
