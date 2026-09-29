"use client";

import * as React from "react";
import Link from "next/link";

import { disputeClaim, markNotificationsRead } from "@/app/actions/claims";
import { switchTreeForm } from "@/app/actions/current-tree";
import { revertEntryEdit } from "@/app/actions/people";
import { respondToPlacement } from "@/app/actions/trees";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { SubmitButton } from "@/components/submit-button";
import { SuggestionAnswer } from "@/components/suggestion-answer";
import { SuggestionChanges } from "@/components/suggestion-changes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";
import { firstFocusable, useFocusReturn } from "@/components/use-focus-return";
import type { NotificationItem } from "@/lib/claims";
import { answeredLine } from "@/lib/suggestions";
import { timeAgo } from "@/lib/time-ago";
import {
  adminHref,
  newTreeHref,
  suggestChangeHref,
  treeFocusHref,
} from "@/lib/tree-links";

/**
 * Fired once a list has marked its notifications read, so the header's bell
 * clears its count without the page being drawn again (Step 61). Its
 * `detail` is `newestNotification` of the list.
 */
export const NOTIFICATIONS_READ_EVENT = "ancestree:notifications-read";

/** When the newest of these arrived, in ms (0 for none). */
export function newestNotification(items: NotificationItem[]): number {
  return items.reduce(
    (max, n) => Math.max(max, Date.parse(n.createdAt) || 0),
    0,
  );
}

export function NotificationsList({
  items,
  showTree = false,
}: {
  items: NotificationItem[];
  /** Name each item's tree — for a list that spans every tree (Step 25). */
  showTree?: boolean;
}) {
  // One dispute form open at a time, across the list.
  const [disputingId, setDisputingId] = React.useState<string | null>(null);
  const hasUnread = items.some((n) => !n.readAt);

  React.useEffect(() => {
    if (!hasUnread) return;
    void markNotificationsRead();
    window.dispatchEvent(
      new CustomEvent(NOTIFICATIONS_READ_EVENT, {
        detail: newestNotification(items),
      }),
    );
  }, [hasUnread, items]);

  if (items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">No notifications yet.</p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {items.map((n) => (
        <NotificationRow
          key={n.id}
          n={n}
          showTree={showTree}
          disputing={disputingId === n.id}
          onDisputingChange={(open) =>
            // A dispute sent from one item mustn't close another's form,
            // opened since.
            setDisputingId((current) =>
              open ? n.id : current === n.id ? null : current,
            )
          }
        />
      ))}
    </ul>
  );
}

/**
 * One notification, with the answers it asks for. Each item has its own
 * calls (Step 70), so answering one leaves every other item's buttons be.
 */
function NotificationRow({
  n,
  showTree,
  disputing,
  onDisputingChange,
}: {
  n: NotificationItem;
  showTree: boolean;
  /** Its dispute form is open. */
  disputing: boolean;
  onDisputingChange: (open: boolean) => void;
}) {
  const action = useAction();
  // The dispute is a small form: what goes wrong shows by its button.
  const dispute = useAction({ inline: true });
  const [reason, setReason] = React.useState("");
  const returnFocus = useFocusReturn();
  const rowRef = React.useRef<HTMLLIElement>(null);
  const disputeButtonRef = React.useRef<HTMLButtonElement>(null);
  const reasonRef = React.useRef<HTMLInputElement>(null);
  const busy = action.pending || dispute.pending;
  const suggestion = n.suggestion;
  const placementId = n.placementId;
  const revisionId = n.revertibleRevisionId;
  const claimId = n.claimId;

  // An answered item loses the buttons that answered it: focus moves on to
  // what's left of it rather than drop to the page.
  const answered = () => returnFocus(() => firstFocusable(rowRef.current));

  function onRevert(id: string) {
    action.run("undo", () => revertEntryEdit(id), {
      success: "Change undone. The Branch who made it has been told.",
      onSuccess: answered,
    });
  }

  function onPlacement(id: string, accept: boolean) {
    action.run(
      accept ? "placement:accept" : "placement:decline",
      () => respondToPlacement(id, accept),
      {
        // Their entry now shows on another tree, which nothing here says.
        success: accept ? "You're on that tree now." : undefined,
        onSuccess: answered,
      },
    );
  }

  function openDispute() {
    setReason("");
    dispute.setError(null);
    onDisputingChange(true);
    returnFocus(() => reasonRef.current);
  }

  function closeDispute() {
    dispute.setError(null);
    onDisputingChange(false);
    returnFocus(() => disputeButtonRef.current);
  }

  function onDispute(id: string) {
    dispute.run("dispute", () => disputeClaim(id, reason), {
      success: "Dispute sent to a Root.",
      onSuccess: () => {
        onDisputingChange(false);
        setReason("");
        // A disputed claim can't be disputed again, so its button goes too.
        returnFocus(
          () => disputeButtonRef.current ?? firstFocusable(rowRef.current),
        );
      },
    });
  }

  return (
    <li
      ref={rowRef}
      className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <p className={n.readAt ? "text-muted-foreground" : "font-medium"}>
          {showTree && n.treeName ? (
            <span className="mr-1.5 rounded-sm bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">
              {n.treeName}
            </span>
          ) : null}
          {n.body}
        </p>
        <span className="shrink-0 text-xs text-muted-foreground">
          {timeAgo(n.createdAt)}
        </span>
      </div>

      {suggestion ? (
        // What a relative suggests changing, to answer here (Step 67);
        // on the suggester's answer, what they suggested (Step 71).
        <div className="flex flex-col gap-2 rounded-md bg-muted/40 p-2">
          <SuggestionChanges rows={suggestion.rows} />
          {n.type === "change_suggested" ? (
            <>
              {suggestion.note ? (
                <p className="text-sm whitespace-pre-wrap text-muted-foreground">
                  {suggestion.note}
                </p>
              ) : null}
              {suggestion.status === "pending" ? (
                <SuggestionAnswer
                  suggestionId={suggestion.id}
                  onAnswered={answered}
                />
              ) : (
                <p className="text-xs text-muted-foreground">
                  {answeredLine({
                    status: suggestion.status,
                    decidedBy: suggestion.decidedBy,
                    declineReason: suggestion.declineReason,
                  })}
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {placementId ? (
          <>
            <PendingButton
              size="sm"
              pending={action.pendingKey === "placement:accept"}
              disabled={busy}
              pendingLabel="Accepting…"
              onClick={() => onPlacement(placementId, true)}
            >
              Accept
            </PendingButton>
            <PendingButton
              size="sm"
              variant="outline"
              pending={action.pendingKey === "placement:decline"}
              disabled={busy}
              pendingLabel="Declining…"
              onClick={() => onPlacement(placementId, false)}
            >
              Decline
            </PendingButton>
          </>
        ) : null}

        {n.type === "suggestion_declined" &&
        suggestion &&
        n.personId &&
        n.treeId ? (
          // Step 71: back into the form with what they suggested, on
          // the tree they suggested it from.
          <form
            action={switchTreeForm.bind(
              null,
              n.treeId,
              suggestChangeHref(n.personId, suggestion.id),
            )}
          >
            <SubmitButton size="sm" variant="outline" pendingLabel="Opening…">
              Edit and resend
            </SubmitButton>
          </form>
        ) : null}

        {n.personId && n.treeId ? (
          // The item's tree may not be the one being looked at: switch
          // to it, then open the person.
          <form
            action={switchTreeForm.bind(
              null,
              n.treeId,
              treeFocusHref(n.personId),
            )}
          >
            <SubmitButton size="sm" variant="ghost" pendingLabel="Opening…">
              View on tree
            </SubmitButton>
          </form>
        ) : null}

        {n.type === "placed_on_join" && n.treeId ? (
          // Step 30.9: joining brought a member's own entry onto this
          // tree, and with a claim invite perhaps folded the entry it
          // named into theirs (Step 41.3). A Root keeps it, or takes it
          // off in "Who This Tree Shows" — on the tree the notice is about.
          <form
            action={switchTreeForm.bind(
              null,
              n.treeId,
              adminHref("placements"),
            )}
          >
            <SubmitButton size="sm" variant="outline" pendingLabel="Opening…">
              View in Root console
            </SubmitButton>
          </form>
        ) : null}

        {n.type === "joined_by_link" && n.treeId ? (
          // Step 52: someone joined with the family link. Who else has,
          // and how full it is, are on its card.
          <form
            action={switchTreeForm.bind(
              null,
              n.treeId,
              adminHref("family-link"),
            )}
          >
            <SubmitButton size="sm" variant="outline" pendingLabel="Opening…">
              View family link
            </SubmitButton>
          </form>
        ) : null}

        {n.type === "tree_request_approved" ? (
          // Step 28: a reviewer said yes; naming the tree is the next step.
          <Button
            nativeButton={false}
            render={<Link href={newTreeHref()} />}
            size="sm"
            variant="outline"
          >
            Start your tree
          </Button>
        ) : null}

        {revisionId ? (
          <PendingButton
            size="sm"
            variant="outline"
            pending={action.pendingKey === "undo"}
            disabled={busy}
            pendingLabel="Undoing…"
            onClick={() => onRevert(revisionId)}
          >
            Undo this change
          </PendingButton>
        ) : null}

        {n.canDispute && claimId && !disputing ? (
          <Button
            ref={disputeButtonRef}
            size="sm"
            variant="outline"
            onClick={openDispute}
          >
            Dispute this claim
          </Button>
        ) : null}
      </div>

      {disputing && claimId ? (
        <div className="flex flex-col gap-2 rounded-md border border-border p-2">
          <label
            htmlFor={`reason-${n.id}`}
            className="text-xs font-medium text-muted-foreground"
          >
            Why is this claim wrong? (optional)
          </label>
          <Input
            ref={reasonRef}
            id={`reason-${n.id}`}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="This isn't the same person…"
          />
          <FormError>{dispute.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              size="sm"
              pending={dispute.pending}
              disabled={action.pending}
              pendingLabel="Sending…"
              onClick={() => onDispute(claimId)}
            >
              Send dispute
            </PendingButton>
            <Button
              size="sm"
              variant="ghost"
              disabled={dispute.pending}
              onClick={closeDispute}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
