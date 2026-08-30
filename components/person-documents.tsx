"use client";

import * as React from "react";
import { toast } from "sonner";

import {
  listDocuments,
  recordDocument,
  removeDocument,
  signDocument,
  type PersonDocument,
} from "@/app/actions/people";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fileExtension } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const ALLOWED = /^(application\/pdf|image\/jpeg|image\/png)$/;
// Keep well under the Supabase free-tier limits (50MB/file, 1GB total).
const MAX_BYTES = 10 * 1024 * 1024;

export function PersonDocuments({
  personId,
  treeId,
}: {
  personId: string;
  treeId: string;
}) {
  const [docs, setDocs] = React.useState<PersonDocument[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [pendingId, setPendingId] = React.useState<string | null>(null);

  const refresh = React.useCallback(() => {
    listDocuments(personId).then(setDocs);
  }, [personId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    setBusy(true);
    const supabase = createClient();
    try {
      for (const file of files) {
        if (!ALLOWED.test(file.type)) {
          toast.error(`${file.name}: only PDF, JPG, or PNG files.`);
          continue;
        }
        if (file.size > MAX_BYTES) {
          toast.error(`${file.name}: files must be 10MB or smaller.`);
          continue;
        }
        const path = `${treeId}/${personId}/${crypto.randomUUID()}.${fileExtension(file)}`;
        const { error } = await supabase.storage
          .from("documents")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          toast.error(`${file.name}: upload failed.`);
          continue;
        }
        const recorded = await recordDocument({
          personId,
          filePath: path,
          fileName: file.name,
          mimeType: file.type,
        });
        if (recorded.error) {
          toast.error(`${file.name}: ${recorded.error}`);
          await supabase.storage.from("documents").remove([path]);
        }
      }
      refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onDownload(id: string) {
    setPendingId(id);
    try {
      const { url, error } = await signDocument(id);
      if (error || !url) {
        toast.error(error ?? "Couldn't prepare the download.");
        return;
      }
      window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setPendingId(null);
    }
  }

  async function onRemove(id: string) {
    setPendingId(id);
    try {
      const { error } = await removeDocument(id);
      if (error) {
        toast.error(error);
        return;
      }
      setDocs((current) => current?.filter((d) => d.id !== id) ?? null);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="text-sm font-semibold">
        Documents
      </h2>

      <div className="flex flex-col gap-1">
        <Label htmlFor="documents">Add documents</Label>
        <Input
          id="documents"
          type="file"
          accept={ACCEPT}
          multiple
          onChange={onPick}
          disabled={busy}
        />
        <p className="text-xs text-muted-foreground">
          PDF, JPG, or PNG. Only you and admins can see these.
        </p>
      </div>

      {docs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {docs.map((doc) => (
            <li
              key={doc.id}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
            >
              <span className="truncate font-medium">{doc.file_name}</span>
              <span className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pendingId === doc.id}
                  onClick={() => onDownload(doc.id)}
                >
                  Download
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={pendingId === doc.id}
                  onClick={() => onRemove(doc.id)}
                >
                  Remove
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
