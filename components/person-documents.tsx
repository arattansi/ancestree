"use client";

import * as React from "react";

import {
  listDocuments,
  recordDocument,
  removeDocument,
  signDocument,
  type PersonDocument,
} from "@/app/actions/people";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import { fileExtension } from "@/lib/image";
import { createClient } from "@/lib/supabase/client";

const ACCEPT = ".pdf,.jpg,.jpeg,.png";
const ALLOWED = /^(application\/pdf|image\/jpeg|image\/png)$/;
// Keep well under the Supabase free-tier limits (50MB/file, 1GB total).
const MAX_BYTES = 10 * 1024 * 1024;

/**
 * An entry's documents. Only its owner, the Branch for its side of the tree
 * and the Roots can list and download them (`private.can_see_documents`, Step
 * 18.4) — the caller shows this only to them. Adding and removing is for
 * whoever can edit the entry (`private.can_edit_person`), a narrower set, so
 * only they are offered the controls.
 */
export function PersonDocuments({
  personId,
  treeId,
  canEdit,
}: {
  personId: string;
  treeId: string;
  /** The viewer can edit this entry — mirrors `lib/branch#canEditEntry`. */
  canEdit: boolean;
}) {
  const [docs, setDocs] = React.useState<PersonDocument[] | null>(null);
  // What went wrong with the last files picked shows under the picker, one
  // line a file, until the next pick (Step 70).
  const upload = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const pickerRef = React.useRef<HTMLInputElement>(null);

  const refresh = React.useCallback(() => {
    listDocuments(treeId, personId).then(setDocs);
  }, [treeId, personId]);

  React.useEffect(() => {
    refresh();
  }, [refresh]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    // The picker is disabled while they go up, which drops focus: it takes
    // it back once it's free again, however the upload went.
    const refocus = () =>
      returnFocus(() =>
        pickerRef.current?.disabled ? null : pickerRef.current,
      );
    upload.run(
      "upload",
      async () => {
        const problems: string[] = [];
        const supabase = createClient();
        for (const file of files) {
          if (!ALLOWED.test(file.type)) {
            problems.push(`${file.name}: only PDF, JPG, or PNG files.`);
            continue;
          }
          if (file.size > MAX_BYTES) {
            problems.push(`${file.name}: files must be 10MB or smaller.`);
            continue;
          }
          const path = `${treeId}/${personId}/${crypto.randomUUID()}.${fileExtension(file)}`;
          const { error } = await supabase.storage
            .from("documents")
            .upload(path, file, { contentType: file.type, upsert: false });
          if (error) {
            problems.push(`${file.name}: upload failed.`);
            continue;
          }
          const recorded = await recordDocument({
            treeId,
            personId,
            filePath: path,
            fileName: file.name,
            mimeType: file.type,
          });
          if (recorded.error) {
            problems.push(`${file.name}: ${recorded.error}`);
            await supabase.storage.from("documents").remove([path]);
          }
        }
        refresh();
        // Every file's problem, a line each; none, and it worked.
        return { error: problems.join("\n") };
      },
      { onSuccess: refocus, onError: refocus },
    );
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="documents-heading">
      <h2 id="documents-heading" className="text-sm font-semibold">
        Documents
      </h2>

      {canEdit ? (
        <div className="flex flex-col gap-1">
          <Label htmlFor="documents">Add documents</Label>
          <Input
            ref={pickerRef}
            id="documents"
            type="file"
            accept={ACCEPT}
            multiple
            onChange={onPick}
            disabled={upload.pending}
          />
          <FormError className="whitespace-pre-line">{upload.error}</FormError>
          <p className="text-xs text-muted-foreground">
            PDF, JPG, or PNG. Only this entry&rsquo;s owner, the Branch for
            this side of the family, and the Roots can see them.
          </p>
        </div>
      ) : null}

      {docs === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No documents yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {docs.map((doc) => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              canEdit={canEdit}
              onRemoved={() =>
                setDocs(
                  (current) => current?.filter((d) => d.id !== doc.id) ?? null,
                )
              }
            />
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One document, with its own handle, so preparing one download leaves the
 * other rows free (Step 70).
 */
function DocumentRow({
  doc,
  canEdit,
  onRemoved,
}: {
  doc: PersonDocument;
  canEdit: boolean;
  /** It's gone: the list is this component's own, so it drops the row. */
  onRemoved: () => void;
}) {
  const download = useAction();

  function onDownload() {
    download.run(
      "download",
      async (): Promise<{ url?: string; error?: string }> => {
        const res = await signDocument(doc.id);
        return res.url
          ? res
          : { error: res.error ?? "Couldn't prepare the download." };
      },
      {
        onSuccess: ({ url }) => {
          if (url) window.open(url, "_blank", "noopener,noreferrer");
        },
      },
    );
  }

  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
      <span className="truncate font-medium">{doc.file_name}</span>
      <span className="flex shrink-0 gap-1">
        <PendingButton
          type="button"
          size="sm"
          variant="outline"
          aria-label={`Download ${doc.file_name}`}
          pending={download.pending}
          pendingLabel="Opening…"
          onClick={onDownload}
        >
          Download
        </PendingButton>
        {canEdit ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            aria-label={`Remove ${doc.file_name}`}
            disabled={download.pending}
            confirm={{
              title: `Remove ${doc.file_name}?`,
              description: "This cannot be undone.",
              confirmLabel: "Remove",
              pendingLabel: "Removing…",
              onConfirm: () => removeDocument(doc.id),
              onSuccess: onRemoved,
            }}
          >
            Remove
          </ConfirmButton>
        ) : null}
      </span>
    </li>
  );
}
