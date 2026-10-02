"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { addPlaceholderChild } from "@/app/actions/people";
import { sendClaimInvite } from "@/app/actions/invites";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { HeldBackDetails } from "@/components/tree/held-back-details";
import {
  useLoadPersonSheet,
  usePersonSheet,
} from "@/components/tree/use-person-sheet";
import { heldBackRows } from "@/lib/held-back";
import { treeFocusHref } from "@/lib/tree-links";

/**
 * "Add a placeholder instead" (Step 98.2), where adding someone under 18 is
 * refused to a Root or a Branch: holds the child's place under `parents`,
 * shown as "First Child"…, for their parent to fill in. A parent who is a
 * member is told; one who isn't yet is offered an invite to claim their own
 * entry, which is how they come to fill it in.
 */
export function AddPlaceholderButton({
  treeId,
  parents,
  nameOf,
  disabled,
}: {
  treeId: string;
  /** The child's parents on the tree, one or two, the one to invite first. */
  parents: readonly string[];
  nameOf: (id: string) => string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const add = useAction({ inline: true });
  const invite = useAction({ inline: true });
  const [made, setMade] = React.useState<{
    personId: string;
    parentId: string;
  } | null>(null);
  const [email, setEmail] = React.useState("");

  const done = (personId: string) => router.push(treeFocusHref(personId));

  return (
    <>
      <div className="flex flex-col gap-2">
        <PendingButton
          type="button"
          size="sm"
          variant="outline"
          className="self-start"
          pending={add.pending}
          pendingLabel="adding…"
          disabled={disabled || parents.length === 0}
          onClick={() =>
            add.run("add", () => addPlaceholderChild(treeId, [...parents]), {
              onSuccess: (res) => {
                const personId = res.personId!;
                const uninvited = res.uninvitedParentIds ?? [];
                // Invite the parent this child was added to, if anyone.
                const parentId = parents.find((id) => uninvited.includes(id));
                if (parentId) setMade({ personId, parentId });
                else done(personId);
              },
              success: (res) =>
                res.uninvitedParentIds?.length ? null : "Placeholder added.",
            })
          }
        >
          add a placeholder instead
        </PendingButton>
        <FormError>{add.error}</FormError>
      </div>

      <Dialog
        open={made !== null}
        onOpenChange={(open) => {
          if (!open && made && !invite.pending) done(made.personId);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Invite {made ? nameOf(made.parentId) : "their parent"} to fill it
              in?
            </DialogTitle>
          </DialogHeader>
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!made) return;
              const { personId, parentId } = made;
              invite.run(
                "send",
                () => sendClaimInvite(parentId, email, treeId),
                {
                  success: (res) => `Invite sent to ${res.email ?? "them"}.`,
                  onSuccess: () => done(personId),
                },
              );
            }}
          >
            <Label htmlFor="placeholder-parent-email">Email</Label>
            <Input
              id="placeholder-parent-email"
              type="email"
              inputMode="email"
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={invite.pending}
            />
            <FormError>{invite.error}</FormError>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={invite.pending}
                onClick={() => made && done(made.personId)}
              >
                not now
              </Button>
              <PendingButton
                type="submit"
                pending={invite.pending}
                pendingLabel="sending…"
                disabled={email.trim().length === 0}
              >
                send invite
              </PendingButton>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * A placeholder's held-back details (Step 98.3) on its fill-in page, for its
 * parent: what they choose to show, before typing over it, since a fill
 * drops whatever is still held back. Nothing when nothing is.
 */
export function PlaceholderHeldBack({
  personId,
  name,
}: {
  personId: string;
  name: string;
}) {
  useLoadPersonSheet(personId, {
    trees: false,
    album: false,
    stories: false,
    reports: 0,
    heldBack: true,
  });
  const rows = heldBackRows(usePersonSheet(personId)?.sheet.heldBack);
  if (rows.length === 0) return null;
  return <HeldBackDetails personId={personId} name={name} asParent />;
}
