"use client";

import * as React from "react";

import { RowList } from "@/components/row-card";
import { ReportCard } from "@/components/tree/entry-reports";
import type { TreeReport } from "@/lib/entry-reports";

/**
 * The open reports on the tree's own entries (Step 88.2): a Root may put
 * any of them right, and decides the disputed claims.
 */
export function AdminReports({ reports }: { reports: TreeReport[] }) {
  return (
    <RowList items={reports} empty="No open reports.">
      {(r) => (
        <ReportCard
          key={r.id}
          report={r}
          personName={r.personName}
          linkToPerson
          canResolve
          canDecide
        />
      )}
    </RowList>
  );
}
