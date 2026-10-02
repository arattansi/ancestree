"use client";

import { exportTreeData } from "@/app/actions/privacy";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";

export function AdminExport({ treeId }: { treeId: string }) {
  const action = useAction();

  function onExport() {
    action.run(
      "export",
      async () => {
        const res = await exportTreeData(treeId);
        if (res.error || !res.json) return { error: res.error ?? "Export failed." };
        const blob = new Blob([res.json], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = res.filename ?? "ancestree-export.json";
        a.click();
        URL.revokeObjectURL(url);
        return {};
      },
      { success: "Export downloaded." },
    );
  }

  return (
    <PendingButton
      variant="outline"
      size="sm"
      onClick={onExport}
      pending={action.pending}
      pendingLabel="preparing…"
    >
      download JSON export
    </PendingButton>
  );
}
