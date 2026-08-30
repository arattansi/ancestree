"use client";

import * as React from "react";
import { toast } from "sonner";

import { exportTreeData } from "@/app/actions/privacy";
import { Button } from "@/components/ui/button";

export function AdminExport() {
  const [busy, setBusy] = React.useState(false);

  async function onExport() {
    setBusy(true);
    try {
      const res = await exportTreeData();
      if (res.error || !res.json) {
        toast.error(res.error ?? "Export failed.");
        return;
      }
      const blob = new Blob([res.json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = res.filename ?? "ancestree-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={onExport} disabled={busy}>
      {busy ? "Preparing…" : "Download JSON export"}
    </Button>
  );
}
