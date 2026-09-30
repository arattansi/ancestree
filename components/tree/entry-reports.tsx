"use client";

import * as React from "react";
import Link from "next/link";

import {
  decideClaimDispute,
  getEntryReports,
  resolveEntryReport,
  withdrawEntryReport,
} from "@/app/actions/entry-reports";
import { ActionButton } from "@/components/action-button";
import { ConfirmButton } from "@/components/confirm-dialog";
import { RowCard } from "@/components/row-card";
import { Badge } from "@/components/ui/badge";
import type { EntryReport } from "@/lib/entry-reports";
import { timeAgo } from "@/lib/time-ago";
import { treeFocusHref } from "@/lib/tree-links";

/**
 * One open report (Step 88.2), with what the viewer may do about it: put
 * right and mark resolved, if they may edit the entry; uphold or reverse a
 * disputed claim, if they're a Root of its home tree; withdraw their own.
 */
export function ReportCard({
  report,
  personName,
  linkToPerson = false,
  canResolve,
  canDecide,
  onDone,
}: {
  report: EntryReport;
  personName: string;
  /** Name the entry at the top, opening it on the tree (the Root console). */
  linkToPerson?: boolean;
  canResolve: boolean;
  canDecide: boolean;
  /** It's been dealt with, and goes from the list. */
  onDone?: (reportId: string) => void;
}) {
  const done = () => onDone?.(report.id);
  const claim = report.claimantName
    ? `${report.claimantName}’s claim to ${personName}`
    : `the claim to ${personName}`;
  return (
    <RowCard>
      {linkToPerson ? (
        <Link
          href={treeFocusHref(report.personId)}
          className="self-start font-medium underline-offset-2 hover:underline"
        >
          {personName}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {report.dispute ? (
          <Badge variant="destructive">Claim disputed</Badge>
        ) : null}
        <span className="font-medium">
          {report.mine ? "You" : report.authorName}
        </span>
        <span className="text-xs text-muted-foreground">
          {timeAgo(report.createdAt)}
        </span>
      </div>
      {report.dispute && report.claimantName ? (
        <p className="text-muted-foreground">
          Claimed by {report.claimantName}
        </p>
      ) : null}
      <p className="whitespace-pre-wrap">{report.body}</p>
      <div className="flex flex-wrap gap-2 empty:hidden">
        {!report.dispute && canResolve ? (
          <ActionButton
            size="sm"
            variant="outline"
            action={() => resolveEntryReport(report.id)}
            pendingLabel="Resolving…"
            removesRow
            onSuccess={done}
          >
            Mark resolved
          </ActionButton>
        ) : null}
        {report.dispute && canDecide ? (
          <>
            <ConfirmButton
              size="sm"
              confirm={{
                title: `Uphold ${claim}?`,
                destructive: false,
                confirmLabel: "Uphold claim",
                pendingLabel: "Upholding…",
                onConfirm: () => decideClaimDispute(report.id, true),
                onSuccess: done,
              }}
            >
              Uphold claim
            </ConfirmButton>
            <ConfirmButton
              size="sm"
              variant="outline"
              confirm={{
                title: `Reverse ${claim}?`,
                // `decide_claim_dispute` hands the entry back to whoever
                // added it, who is whoever disputed it.
                description: `${personName} goes back to ${report.mine ? "you" : report.authorName}.`,
                confirmLabel: "Reverse claim",
                pendingLabel: "Reversing…",
                onConfirm: () => decideClaimDispute(report.id, false),
                onSuccess: done,
              }}
            >
              Reverse claim
            </ConfirmButton>
          </>
        ) : null}
        {report.mine ? (
          <ActionButton
            size="sm"
            variant="ghost"
            action={() => withdrawEntryReport(report.id)}
            pendingLabel="Withdrawing…"
            removesRow
            onSuccess={done}
          >
            Withdraw
          </ActionButton>
        ) : null}
      </div>
    </RowCard>
  );
}

/**
 * The open reports on an entry that the viewer may see (Step 88.2): whoever
 * may put it right, and whoever raised one. Read only when the entry's card
 * counts some for them, and again whenever that count changes.
 */
export function EntryReports({
  personId,
  personName,
  count,
  canEdit,
  canDecide,
}: {
  personId: string;
  personName: string;
  /** Open reports the viewer may see, as the canvas counted them. */
  count: number;
  canEdit: boolean;
  /** A Root of the entry's home tree, who decides a disputed claim. */
  canDecide: boolean;
}) {
  const key = `${personId}:${count}`;
  const [state, setState] = React.useState<{
    key: string;
    reports: EntryReport[] | null;
  }>({ key, reports: null });
  // Dealt with here, and gone before the canvas's count catches up.
  const [gone, setGone] = React.useState<ReadonlySet<string>>(new Set());

  React.useEffect(() => {
    if (count === 0) return;
    let active = true;
    getEntryReports(personId).then(
      (reports) => {
        if (active) setState({ key: `${personId}:${count}`, reports });
      },
      () => undefined,
    );
    return () => {
      active = false;
    };
  }, [personId, count]);

  const reports =
    state.key === key
      ? (state.reports ?? []).filter((r) => !gone.has(r.id))
      : [];
  if (count === 0 || reports.length === 0) return null;

  return (
    <section className="flex flex-col gap-3" aria-labelledby="reports-heading">
      <h2 id="reports-heading" className="text-sm font-semibold">
        Reports
      </h2>
      <ul className="flex flex-col gap-2">
        {reports.map((r) => (
          <ReportCard
            key={r.id}
            report={r}
            personName={personName}
            // Visible to them and not theirs: they may fix it, or decide it.
            canResolve={canEdit || !r.mine}
            canDecide={canDecide || (!r.mine && r.dispute)}
            onDone={(id) => setGone((cur) => new Set(cur).add(id))}
          />
        ))}
      </ul>
    </section>
  );
}
