"use client";

import * as React from "react";
import Form from "next/form";

import {
  deleteAccountAsReviewer,
  deleteTreeAsReviewer,
  setAccountSuspended,
} from "@/app/actions/admin-manage";
import { SuccessorPickers } from "@/components/delete-account";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import {
  ADMIN_SEARCH_MAX,
  accountTreesLine,
  soleRootTreesOf,
  treeCountsLine,
  type FoundAccount,
  type FoundTree,
} from "@/lib/admin-manage";
import { shortDate } from "@/lib/short-date";

/**
 * A search box on the manage tab: a GET to `/admin?tab=manage&<name>=…`,
 * so the page finds what's asked for and the address keeps it.
 */
function AdminSearch({
  name,
  label,
  value,
}: {
  name: "account" | "tree";
  label: string;
  value: string | null;
}) {
  const id = `admin-search-${name}`;
  return (
    <Form action="/admin" scroll={false} className="flex flex-col gap-2">
      <input type="hidden" name="tab" value="manage" />
      <Label htmlFor={id}>{label}</Label>
      <div className="flex gap-2">
        <Input
          // A new search is a new box: Base UI won't take a changed default.
          key={value ?? ""}
          id={id}
          name={name}
          type="search"
          defaultValue={value ?? ""}
          maxLength={ADMIN_SEARCH_MAX}
          autoComplete="off"
        />
        <Button type="submit" variant="outline">
          find
        </Button>
      </div>
    </Form>
  );
}

/**
 * Accounts on the admin page's manage tab (Step 103.4): find one by
 * address or name, then suspend or restore it, or delete it. A reviewer's
 * own account, and the other reviewers', are only shown.
 */
export function AdminAccounts({
  query,
  accounts,
}: {
  query: string | null;
  accounts: FoundAccount[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <AdminSearch name="account" label="Email or name" value={query} />
      {query ? (
        <RowList items={accounts} empty="No accounts found.">
          {(a) => <AccountRow key={a.userId} account={a} />}
        </RowList>
      ) : null}
    </div>
  );
}

function accountName(a: FoundAccount): string {
  return a.name ?? a.email ?? "Unnamed account";
}

function AccountRow({ account: a }: { account: FoundAccount }) {
  const action = useAction();
  const trees = accountTreesLine(a);

  return (
    <RowCard>
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-1.5 font-medium">
          <span className="break-words">{accountName(a)}</span>
          {a.suspended ? <Badge variant="destructive">Suspended</Badge> : null}
          {a.reviewer ? <Badge variant="secondary">Reviewer</Badge> : null}
        </p>
        {a.name && a.email ? (
          <p className="break-words text-muted-foreground">{a.email}</p>
        ) : null}
        {trees ? <p className="break-words text-muted-foreground">{trees}</p> : null}
        <p className="text-muted-foreground">
          Joined {shortDate(a.createdAt)}
          {a.lastSignInAt ? ` · last signed in ${shortDate(a.lastSignInAt)}` : ""}
        </p>
      </div>
      {a.reviewer ? null : (
        <div className="flex flex-wrap gap-2">
          <PendingButton
            type="button"
            size="sm"
            variant="outline"
            pending={action.pending}
            pendingLabel={a.suspended ? "restoring…" : "suspending…"}
            onClick={() =>
              action.run("suspend", () => setAccountSuspended(a.userId, !a.suspended))
            }
          >
            {a.suspended ? "restore" : "suspend"}
          </PendingButton>
          <DeleteAccountDialog account={a} />
        </div>
      )}
    </RowCard>
  );
}

function DeleteAccountDialog({ account: a }: { account: FoundAccount }) {
  const [open, setOpen] = React.useState(false);
  const [successors, setSuccessors] = React.useState<Record<string, string>>({});
  const action = useAction({ inline: true });
  const soleRootTrees = soleRootTreesOf(a);
  const handingOver = soleRootTrees.length > 0;
  const everyTreeCovered = soleRootTrees.every((t) => !!successors[t.treeId]);
  const stuck = soleRootTrees.some((t) => t.successors.length === 0);

  function onOpenChange(next: boolean) {
    if (!next && action.pending) return;
    if (next) action.setError(null);
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="destructive">
            delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {accountName(a)}&rsquo;s account?</DialogTitle>
          {stuck ? null : (
            <DialogDescription render={<div />} className="flex flex-col gap-2">
              <p>
                {handingOver
                  ? "They’re the only Root of a tree, so choose who takes over. They become a Root and own everything this account added there."
                  : "This removes their sign-in and profile from every tree. Everything they added stays, managed by a Root."}
              </p>
              <p>This cannot be undone.</p>
            </DialogDescription>
          )}
        </DialogHeader>

        <SuccessorPickers
          trees={soleRootTrees}
          successors={successors}
          onChange={setSuccessors}
          disabled={action.pending}
          nobody={(tree) => `Nobody else is on ${tree}. Delete the tree first.`}
        />

        <FormError>{action.error}</FormError>
        <DialogFooter>
          <DialogClose
            disabled={action.pending}
            render={<Button variant="outline">keep the account</Button>}
          />
          <PendingButton
            variant="destructive-solid"
            onClick={() =>
              action.run("delete", () => deleteAccountAsReviewer(a.userId, successors), {
                success: "Account deleted.",
              })
            }
            pending={action.pending}
            disabled={stuck || (handingOver && !everyTreeCovered)}
            pendingLabel="deleting…"
          >
            {handingOver ? "hand over and delete" : "delete permanently"}
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Trees on the admin page's manage tab (Step 103.4): find one by name,
 * then delete it.
 */
export function AdminTrees({
  query,
  trees,
}: {
  query: string | null;
  trees: FoundTree[];
}) {
  return (
    <div className="flex flex-col gap-4">
      <AdminSearch name="tree" label="Tree name" value={query} />
      {query ? (
        <RowList items={trees} empty="No trees found.">
          {(t) => <TreeRow key={t.id} tree={t} />}
        </RowList>
      ) : null}
    </div>
  );
}

function TreeRow({ tree: t }: { tree: FoundTree }) {
  return (
    <RowCard layout="split">
      <div className="min-w-0">
        <p className="break-words font-medium">{t.name}</p>
        <p className="text-muted-foreground">{treeCountsLine(t)}</p>
        <p className="break-words text-muted-foreground">
          Started {shortDate(t.createdAt)}
          {t.roots.length
            ? ` · ${t.roots.length === 1 ? "Root" : "Roots"}: ${t.roots.join(", ")}`
            : ""}
        </p>
      </div>
      <DeleteTreeDialog tree={t} />
    </RowCard>
  );
}

function DeleteTreeDialog({ tree: t }: { tree: FoundTree }) {
  const [open, setOpen] = React.useState(false);
  const [typed, setTyped] = React.useState("");
  const action = useAction({ inline: true });
  const inputId = `delete-tree-${t.id}`;

  function onOpenChange(next: boolean) {
    if (!next && action.pending) return;
    if (next) {
      action.setError(null);
      setTyped("");
    }
    setOpen(next);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger
        render={
          <Button type="button" size="sm" variant="destructive" className="self-start">
            delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {t.name}?</DialogTitle>
          <DialogDescription render={<div />} className="flex flex-col gap-2">
            <p>
              Everything is deleted, except people who are also on another
              tree. Members keep their accounts.
            </p>
            <p>This cannot be undone.</p>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor={inputId}>Type the tree&rsquo;s name to confirm</Label>
          <Input
            id={inputId}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
          />
        </div>
        <FormError>{action.error}</FormError>
        <DialogFooter>
          <DialogClose
            disabled={action.pending}
            render={<Button variant="outline">keep the tree</Button>}
          />
          <PendingButton
            variant="destructive-solid"
            onClick={() =>
              action.run("delete", () => deleteTreeAsReviewer(t.id), {
                success: "Tree deleted.",
              })
            }
            pending={action.pending}
            pendingLabel="deleting…"
            disabled={typed.trim() !== t.name}
          >
            delete permanently
          </PendingButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
