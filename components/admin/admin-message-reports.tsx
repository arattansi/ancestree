"use client";

import { resolveMessageReport } from "@/app/actions/message-reports";
import { ActionButton } from "@/components/action-button";
import { RowCard, RowList } from "@/components/row-card";
import type { MessageReport } from "@/lib/message-reports.server";
import { timeAgo } from "@/lib/time-ago";

/**
 * Messages reported in the messenger (Step 177.3), for the Roots of a tree
 * the two share and the beta reviewers: the words the reporter's device
 * read, which ancestree can't check, and nothing else of the conversation.
 */
export function AdminMessageReports({ reports }: { reports: readonly MessageReport[] }) {
  return (
    <RowList items={reports} empty="No reported messages.">
      {(r) => (
        <RowCard key={r.id}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {r.reporterName} reported a message from {r.senderName}
            </span>
            <span className="text-xs text-muted-foreground">{timeAgo(r.createdAt)}</span>
          </div>
          <blockquote className="rounded-md bg-muted px-3 py-2 break-words whitespace-pre-wrap">
            {r.body}
          </blockquote>
          {r.reason ? <p className="whitespace-pre-wrap">{r.reason}</p> : null}
          <p className="text-xs text-muted-foreground">
            Sent {timeAgo(r.sentAt)}
            {r.deleted ? ", deleted since" : ""}. As {r.reporterName}&rsquo;s device read it:
            ancestree can&rsquo;t read messages to check.
          </p>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              size="sm"
              variant="outline"
              action={() => resolveMessageReport(r.id)}
              pendingLabel="resolving…"
              removesRow
            >
              mark resolved
            </ActionButton>
          </div>
        </RowCard>
      )}
    </RowList>
  );
}
