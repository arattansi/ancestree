"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import {
  approveInviteRequest,
  declineInviteRequest,
} from "@/app/actions/invite-requests";
import { DeleteInviteButton } from "@/components/delete-invite-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

/** Which button is working: a request, approved as an entry or without one. */
type Busy = { id: string; personId: string | null };

export function AdminInviteRequests({
  requests,
}: {
  requests: PendingInviteRequest[];
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<Busy | null>(null);
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

  /**
   * Approve, as one of the entries their name matches or (`personId` null)
   * without one: then they find or add themselves on onboarding, as before.
   */
  async function onApprove(request: PendingInviteRequest, personId: string | null) {
    const { id, email } = request;
    setBusy({ id, personId });
    let res: Awaited<ReturnType<typeof approveInviteRequest>>;
    try {
      res = await approveInviteRequest(id, personId);
    } catch {
      // Never strand the row on "Working…" — a rejected action (stale action
      // id after a deploy, dropped connection) has to be recoverable.
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(null);
    }
    if (res.error) {
      toast.error(res.error);
      return;
    }
    if (res.url) {
      setApproved((prev) => ({
        ...prev,
        [id]: {
          request,
          url: res.url!,
          emailed: !!res.emailed,
          entryName: res.entryName ?? null,
        },
      }));
    }
    if (res.emailed) {
      toast.success(
        res.entryName
          ? `Approved as ${res.entryName} — invite emailed to ${email}.`
          : `Approved — invite emailed to ${email}.`,
      );
    } else {
      toast.warning(
        `Approved, but the email didn't send${res.emailError ? ` (${res.emailError})` : ""} — copy the link below and send it yourself.`,
      );
    }
  }

  async function onDecline(id: string) {
    setBusy({ id, personId: null });
    let res: { error?: string };
    try {
      res = await declineInviteRequest(id);
    } catch {
      toast.error("Couldn't reach the server — reload the page and try again.");
      return;
    } finally {
      setBusy(null);
    }
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Request declined.");
    router.refresh();
  }

  /** Let a kept row go once its record is deleted. */
  function forget(id: string) {
    setApproved((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy — select and copy the link manually");
    }
  }

  const working = (id: string, personId: string | null) =>
    busy?.id === id && busy.personId === personId;

  return (
    <ul className="flex flex-col gap-3">
      {rows.map((r) => {
        const result = approved[r.id];
        const matched = r.candidates.length > 0;
        return (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
          >
            <p className="font-medium">
              {r.firstName} {r.lastName}
            </p>
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
                    aria-label={`Invite link for ${r.firstName} ${r.lastName}`}
                    className="font-mono text-xs"
                  />
                  <Button type="button" variant="outline" onClick={() => copy(result.url)}>
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
                    name={`${r.firstName} ${r.lastName}`}
                    confirmText={`Delete this and cancel the invite you just sent ${r.email}?`}
                    onDeleted={() => forget(r.id)}
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
                          <Button
                            size="sm"
                            disabled={busy !== null}
                            onClick={() => onApprove(r, c.id)}
                          >
                            {working(r.id, c.id) ? "Working…" : `Approve as ${c.name}`}
                          </Button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant={matched ? "outline" : "default"}
                    disabled={busy !== null}
                    onClick={() => onApprove(r, null)}
                  >
                    {working(r.id, null)
                      ? "Working…"
                      : matched
                        ? "Approve without an entry"
                        : "Approve & send invite"}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy !== null}
                    onClick={() => onDecline(r.id)}
                  >
                    Decline
                  </Button>
                  <DeleteInviteButton
                    id={r.id}
                    name={`${r.firstName} ${r.lastName}`}
                    disabled={busy !== null}
                    confirmText={`Delete ${r.firstName} ${r.lastName}’s request? It leaves no record, so they can ask again.`}
                  />
                </div>
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
