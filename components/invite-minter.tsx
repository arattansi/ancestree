"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createInvite } from "@/app/actions/invites";
import { JoinsAsNote } from "@/components/joins-as-note";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Mint a single-use invite link to send yourself. It joins as a Leaf. */
export function InviteMinter({
  treeId,
}: {
  /** The tree the link joins (Step 25). */
  treeId: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function mint() {
    startTransition(async () => {
      const result = await createInvite(treeId);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setUrl(result.url ?? null);
    });
  }

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually");
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <JoinsAsNote />
      <Button type="button" onClick={mint} disabled={pending}>
        {pending ? "Creating…" : "Create invite link"}
      </Button>
      {url ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-url" className="text-sm text-muted-foreground">
            Single-use link — expires in 14 days
          </label>
          <div className="flex gap-2">
            <Input id="invite-url" readOnly value={url} className="font-mono text-xs" />
            <Button type="button" variant="outline" onClick={copy}>
              Copy
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
