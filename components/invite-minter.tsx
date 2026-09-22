"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { createInvite } from "@/app/actions/invites";
import { JoinsAsChoice } from "@/components/joins-as-choice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { accountTypeOf, type AccountTypeKey } from "@/lib/account-types";

/**
 * Mint a single-use invite link to send yourself. `options` is what the
 * inviter may make someone (`invitableTypes`), widest first; the first is the
 * default.
 */
export function InviteMinter({
  treeId,
  options = ["member"],
}: {
  /** The tree the link joins (Step 25). */
  treeId: string;
  options?: readonly AccountTypeKey[];
}) {
  const [url, setUrl] = useState<string | null>(null);
  // What the link on screen joins as — kept apart from the choice, which can
  // change after the link is minted.
  const [urlJoinsAs, setUrlJoinsAs] = useState<AccountTypeKey | null>(null);
  const [joinsAs, setJoinsAs] = useState<AccountTypeKey>(options[0]);
  const [pending, startTransition] = useTransition();

  function mint() {
    startTransition(async () => {
      const result = await createInvite(treeId, joinsAs);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      setUrl(result.url ?? null);
      setUrlJoinsAs(joinsAs);
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
      <JoinsAsChoice
        options={options}
        value={joinsAs}
        onChange={setJoinsAs}
        disabled={pending}
      />
      <Button type="button" onClick={mint} disabled={pending}>
        {pending ? "Creating…" : "Create invite link"}
      </Button>
      {url ? (
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-url" className="text-sm text-muted-foreground">
            Single-use link — expires in 14 days
            {urlJoinsAs
              ? ` · joins as ${accountTypeOf(urlJoinsAs).name}`
              : ""}
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
