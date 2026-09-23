"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { renameTree } from "@/app/actions/trees";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const MAX_TREE_NAME = 80;

/**
 * Naming the tree, in the founder's first run (Step 29). It opens on their
 * family's name when the tree still has the one it was planted with, and
 * saves only a change.
 */
export function NameStep({
  treeId,
  initialName,
  currentName,
  nextHref,
}: {
  treeId: string;
  /** What the box starts with: a suggestion, or the name it already has. */
  initialName: string;
  currentName: string;
  nextHref: string;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(initialName);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give your tree a name.");
      return;
    }
    if (trimmed !== currentName.trim()) {
      setPending(true);
      const res = await renameTree(treeId, trimmed);
      if (res.error) {
        setPending(false);
        setError(res.error);
        return;
      }
      toast.success(`Your tree is called ${trimmed}.`);
    }
    router.push(nextHref);
    router.refresh();
  }

  return (
    <Card>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-2">
            <Label htmlFor="first-tree-name">Your tree&rsquo;s name</Label>
            <Input
              id="first-tree-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={MAX_TREE_NAME}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "first-tree-name-error" : undefined}
            />
            {error ? (
              <p
                id="first-tree-name-error"
                role="alert"
                className="text-sm text-destructive"
              >
                {error}
              </p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Save and continue"}
            </Button>
            <Button
              nativeButton={false}
              render={<Link href={nextHref} />}
              variant="ghost"
            >
              Skip for now
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
