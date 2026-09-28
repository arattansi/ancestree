"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  approveInviteRequest,
  declineInviteRequest,
} from "@/app/actions/invite-requests";
import { DeleteInviteButton } from "@/components/delete-invite-button";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toastError, useAction } from "@/components/use-action";
import {
  refocusAfterRemoval,
  useFocusReturn,
} from "@/components/use-focus-return";
import { requestRows } from "@/lib/request-rows";
import {
  candidateSummary,
  matchConfidence,
  type SelfCandidate,
} from "@/lib/self-match";

export type PendingInviteRequest = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  createdAt: string;
  /**
   * Entries on the tree the requester's name matches, best first
   * (`invite_request_candidates`, Step 30.3). Empty when none do.
   */
  candidates: SelfCandidate[];
};

type Approved = {
  /** The request as it was when approved, to keep its row (`requestRows`). */
  request: PendingInviteRequest;
  url: string;
  emailed: boolean;
  entryName: string | null;
};

export function AdminInviteRequests({
  requests,
}: {
  requests: PendingInviteRequest[];
}) {
  const [approved, setApproved] = React.useState<Record<string, Approved>>({});

  // Approving refreshes the page around this list (the header's count, Sent
  // Invites), which drops the request from `requests`. Its row stays, so the
  // admin can see the outcome and copy the link as a fallback.
  const rows = requestRows(
    requests,
    Object.values(approved).map((a) => a.request),
  );

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No invite requests to review.
      </p>
    );
  }

  /** Let a kept row go once its record is deleted. */
  function forget(id: string) {
    setApproved((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => (
        <RequestRow
          key={r.id}
          request={r}
          result={approved[r.id]}
          onApproved={(result) =>
            setApproved((prev) => ({ ...prev, [r.id]: result }))
          }
          onForget={() => forget(r.id)}
        />
      ))}
    </ul>
  );
}

/**
 * One request, with its own calls: answering it doesn't hold up the others,
 * and only the button pressed says it's working.
 */
function RequestRow({
  request: r,
  result,
  onApproved,
  onForget,
}: {
  request: PendingInviteRequest;
  /** How approving it went, once it has been. */
  result: Approved | undefined;
  onApproved: (result: Approved) => void;
  onForget: () => void;
}) {
  const action = useAction();
  const returnFocus = useFocusReturn();
  const copyRef = React.useRef<HTMLButtonElement>(null);
  const matched = r.candidates.length > 0;
  const name = `${r.firstName} ${r.lastName}`;

  /**
   * Approve, as one of the entries their name matches or (`personId` null)
   * without one: then they find or add themselves on onboarding, as before.
   */
  function approve(personId: string | null) {
    action.run(
      personId ? `approve:${personId}` : "approve",
      () => approveInviteRequest(r.id, personId),
      {
        onSuccess: (res) => {
          if (res.url) {
            onApproved({
              request: r,
              url: res.url,
              emailed: !!res.emailed,
              entryName: res.entryName ?? null,
            });
            // The buttons give way to the link: focus goes to its Copy.
            returnFocus(() => copyRef.current);
          }
          // The row says the invite was emailed; a failed email needs saying
          // louder, since it's now theirs to send.
          if (!res.emailed) {
            toast.warning(
              `Approved, but the email didn't send${res.emailError ? ` (${res.emailError})` : ""} — copy the link below and send it yourself.`,
            );
          }
        },
      },
    );
  }

  function decline(event: React.MouseEvent<HTMLButtonElement>) {
    const button = event.currentTarget;
    action.run("decline", () => declineInviteRequest(r.id), {
      onSuccess: () => refocusAfterRemoval(button),
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toastError("Couldn't copy — select and copy the link manually");
    }
  }

  return (
    <li className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
      <p className="font-medium">{name}</p>
      <p className="text-muted-foreground">
        {r.email} ·{" "}
        {new Date(r.createdAt).toLocaleDateString(undefined, {
          day: "numeric",
          month: "short",
          year: "numeric",
        })}
      </p>
      {result ? (
        <div className="flex flex-col gap-2">
          <p className={result.emailed ? "text-muted-foreground" : "text-destructive"}>
            {result.emailed
              ? `Invite emailed to ${r.email}.`
              : "Couldn't email this invite — send the link yourself:"}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={result.url}
              aria-label={`Invite link for ${name}`}
              className="font-mono text-xs"
            />
            <Button
              ref={copyRef}
              type="button"
              variant="outline"
              onClick={() => copy(result.url)}
              aria-label={`Copy the invite link for ${name}`}
            >
              Copy
            </Button>
          </div>
          {result.entryName ? (
            <p className="text-muted-foreground">
              Accepting it claims the entry for {result.entryName}.
            </p>
          ) : null}
          <div>
            <DeleteInviteButton
              id={r.id}
              name={name}
              confirm={{
                title: `Delete this and cancel the invite you just sent ${r.email}?`,
              }}
              onDeleted={onForget}
            />
          </div>
        </div>
      ) : (
        <>
          {matched ? (
            // The entries their name matches (Step 30.3): approving as
            // one hands it to them when they accept, so they needn't
            // search for it again on onboarding.
            <div className="flex flex-col gap-2">
              <p className="text-muted-foreground">
                Their name matches{" "}
                {r.candidates.length === 1 ? "this entry" : "these entries"}{" "}
                on the tree:
              </p>
              <ul className="flex flex-col gap-2">
                {r.candidates.map((c) => (
                  <li
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 font-medium">
                        <span className="truncate">{c.name}</span>
                        {matchConfidence(c.score) === "close" ? (
                          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                            close match
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {candidateSummary(c)}
                      </p>
                    </div>
                    <PendingButton
                      size="sm"
                      pending={action.pendingKey === `approve:${c.id}`}
                      disabled={action.pending}
                      pendingLabel="Approving…"
                      onClick={() => approve(c.id)}
                    >
                      {`Approve as ${c.name}`}
                    </PendingButton>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <PendingButton
              size="sm"
              variant={matched ? "outline" : "default"}
              pending={action.pendingKey === "approve"}
              disabled={action.pending}
              pendingLabel="Approving…"
              onClick={() => approve(null)}
            >
              {matched ? "Approve without an entry" : "Approve & send invite"}
            </PendingButton>
            <PendingButton
              size="sm"
              variant="outline"
              pending={action.pendingKey === "decline"}
              disabled={action.pending}
              pendingLabel="Declining…"
              onClick={decline}
            >
              Decline
            </PendingButton>
            <DeleteInviteButton
              id={r.id}
              name={name}
              disabled={action.pending}
              confirm={{
                title: `Delete ${name}’s request?`,
                description: "It leaves no record, so they can ask again.",
              }}
            />
          </div>
        </>
      )}
    </li>
  );
}
