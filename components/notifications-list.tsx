"use client";

import * as React from "react";
import Link from "next/link";

import { markNotificationsRead } from "@/app/actions/claims";
import { revertEntryEdit } from "@/app/actions/people";
import { respondToPlacement } from "@/app/actions/trees";
import { PendingButton } from "@/components/pending-button";
import { RowCard, RowList } from "@/components/row-card";
import { SuggestionAnswer } from "@/components/suggestion-answer";
import { SuggestionChanges } from "@/components/suggestion-changes";
import { TreeTarget } from "@/components/tree-target";
import { ReportDialog } from "@/components/tree/report-dialog";
import { Button } from "@/components/ui/button";
import { useAction } from "@/components/use-action";
import { firstFocusable, useFocusReturn } from "@/components/use-focus-return";
import type { NotificationItem } from "@/lib/claims";
import { answeredLine } from "@/lib/suggestions";
import { timeAgo } from "@/lib/time-ago";
import {
  adminHref,
  asksHref,
  newTreeHref,
  suggestChangeHref,
  treeFocusHref,
} from "@/lib/tree-links";

/**
 * An ask to show an entry on another tree (Step 80): the tree asking is
 * often one they aren't on, and the entry is there as a basic card, so
 * there is nothing of theirs to open on it.
 */
function asksAboutAnotherTree(type: string): boolean {
  return type === "placement_requested" || type === "placements_requested";
}

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
  currentTreeId,
}: {
  items: NotificationItem[];
  /** Name each item's tree — for a list that spans every tree (Step 25). */
  showTree?: boolean;
  /**
   * The tree being looked at: an item on it opens its page with a plain
   * link, one on another tree switches first (Step 77.3).
   */
  currentTreeId: string | null;
}) {
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

  return (
    <RowList items={items} empty="No notifications yet.">
      {(n) => (
        <NotificationRow
          key={n.id}
          n={n}
          showTree={showTree}
          currentTreeId={currentTreeId}
        />
      )}
    </RowList>
  );
}

/**
 * One notification, with the answers it asks for. Each item has its own
 * calls (Step 70), so answering one leaves every other item's buttons be.
 */
function NotificationRow({
  n,
  showTree,
  currentTreeId,
}: {
  n: NotificationItem;
  showTree: boolean;
  currentTreeId: string | null;
}) {
  const action = useAction();
  // Disputing the claim is the report dialog's (Step 88.2).
  const [disputing, setDisputing] = React.useState(false);
  const returnFocus = useFocusReturn();
  const rowRef = React.useRef<HTMLLIElement>(null);
  const busy = action.pending;
  const suggestion = n.suggestion;
  const placementId = n.placementId;
  const revisionId = n.revertibleRevisionId;

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
        success: accept ? "Approved." : "Declined.",
        onSuccess: answered,
      },
    );
  }

  return (
    <RowCard ref={rowRef}>
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
              pendingLabel="Approving…"
              onClick={() => onPlacement(placementId, true)}
            >
              Approve
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
          <TreeTarget
            treeId={n.treeId}
            currentTreeId={currentTreeId}
            href={suggestChangeHref(n.personId, suggestion.id)}
            size="sm"
            variant="outline"
          >
            Edit and resend
          </TreeTarget>
        ) : null}

        {n.type === "placements_requested" ? (
          // Step 80: entries they may edit, asked for by another tree.
          // Answered on their account, one by one or all at once.
          <Button
            nativeButton={false}
            render={<Link href={asksHref()} />}
            size="sm"
          >
            Review
          </Button>
        ) : null}

        {n.personId && n.treeId && !asksAboutAnotherTree(n.type) ? (
          // The item's tree may not be the one being looked at: switch
          // to it, then open the person.
          <TreeTarget
            treeId={n.treeId}
            currentTreeId={currentTreeId}
            href={treeFocusHref(n.personId)}
            size="sm"
            variant="ghost"
          >
            View on tree
          </TreeTarget>
        ) : null}

        {n.type === "placements_lapsed" && n.treeId ? (
          // Step 83: nobody answered in 30 days. The Root who asked can
          // ask again from "Who This Tree Shows".
          <TreeTarget
            treeId={n.treeId}
            currentTreeId={currentTreeId}
            href={adminHref("placements")}
            size="sm"
            variant="outline"
          >
            Ask again
          </TreeTarget>
        ) : null}

        {n.type === "placed_on_join" && n.treeId ? (
          // Step 30.9: joining brought a member's own entry onto this
          // tree, and with a claim invite perhaps folded the entry it
          // named into theirs (Step 41.3). A Root keeps it, or takes it
          // off in "Who This Tree Shows" — on the tree the notice is about.
          <TreeTarget
            treeId={n.treeId}
            currentTreeId={currentTreeId}
            href={adminHref("placements")}
            size="sm"
            variant="outline"
          >
            View in Root console
          </TreeTarget>
        ) : null}

        {n.type === "joined_by_link" && n.treeId ? (
          // Step 52: someone joined with the family link. Who else has,
          // and how full it is, are on its card.
          <TreeTarget
            treeId={n.treeId}
            currentTreeId={currentTreeId}
            href={adminHref("family-link")}
            size="sm"
            variant="outline"
          >
            View family link
          </TreeTarget>
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

        {n.canDispute && n.personId && n.treeId ? (
          <Button size="sm" variant="outline" onClick={() => setDisputing(true)}>
            Dispute this claim
          </Button>
        ) : null}
      </div>

      {n.canDispute && n.personId && n.treeId ? (
        <ReportDialog
          open={disputing}
          onOpenChange={setDisputing}
          personId={n.personId}
          treeId={n.treeId}
          canDispute
          initial="claim"
        />
      ) : null}
    </RowCard>
  );
}
