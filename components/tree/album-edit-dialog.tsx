"use client";

import * as React from "react";

import { editAlbumPhoto } from "@/app/actions/album";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import {
  CompanionPicker,
  type CompanionOption,
} from "@/components/tree/companion-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import type { AlbumPhoto } from "@/lib/album";
import { ALBUM_DESCRIPTION_MAX, ALBUM_PEOPLE_MAX } from "@/lib/limits";
import { toPartialIso } from "@/lib/partial-date";
import { rankByTaken } from "@/lib/photo-tags";

/**
 * Its uploader edits a photo (Step 114): what it's of and who's in it,
 * opened as it is now. The album it's edited from keeps it. Anyone on the
 * canvas may be added, and someone already in it stays offered by name even
 * where this canvas doesn't have them. Someone newly in it waits for
 * approval, as when it was added; new words go back to whoever else
 * approved the old ones. Loaded only once someone opens it.
 */
export function AlbumEditDialog({
  photo,
  onClose,
  personId,
  treeId,
  people,
  onSaved,
}: {
  /** The photo being edited; null while closed. */
  photo: AlbumPhoto | null;
  onClose: () => void;
  /** Whose album it's edited from, who stays in it. */
  personId: string;
  treeId: string;
  /** Everyone on the canvas, who may be tagged. */
  people: CompanionOption[];
  /** Saved: the album now, when it could be read. */
  onSaved: (photos: AlbumPhoto[] | undefined) => void;
}) {
  const save = useAction({ inline: true });
  const [description, setDescription] = React.useState("");
  const [tagged, setTagged] = React.useState<string[]>([]);

  // Opened on a photo: as it is now.
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const photoId = photo?.id ?? null;
  if (photoId !== openedOn) {
    setOpenedOn(photoId);
    if (photo) {
      setDescription(photo.description ?? "");
      setTagged([personId, ...photo.others.map((o) => o.id)]);
      save.setError(null);
    }
  }

  // Those alive when it was taken first, and whoever's in it already.
  const options = React.useMemo(() => {
    const taken = photo ? toPartialIso(photo.takenOn, photo.takenPrecision) : "";
    const ranked = rankByTaken(people, taken || null);
    const known = new Set(ranked.map((p) => p.id));
    const extra = (photo?.others ?? [])
      .filter((o) => !known.has(o.id))
      .map((o) => ({ id: o.id, label: o.name }));
    return [...ranked, ...extra];
  }, [people, photo]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!photo) return;
    save.run(
      "save",
      () =>
        editAlbumPhoto({
          photoId: photo.id,
          personId,
          treeId,
          description,
          people: tagged,
        }),
      {
        success: (res) => (res.pending ? "Sent for approval." : null),
        onSuccess: (res) => {
          onSaved(res.photos);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open={!!photo}
      onOpenChange={(next) => {
        if (!next && !save.pending) onClose();
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Edit photo</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          {photo?.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
            <img
              src={photo.url}
              alt=""
              className="max-h-48 w-full rounded-md bg-muted object-contain"
            />
          ) : null}
          <div className="flex flex-col gap-2">
            <Label htmlFor="album-edit-description">Description</Label>
            <Textarea
              id="album-edit-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={ALBUM_DESCRIPTION_MAX}
              disabled={save.pending}
            />
          </div>
          <CompanionPicker
            key={openedOn ?? ""}
            label="Who’s in it"
            options={options}
            value={tagged}
            onChange={(ids) => setTagged(ids.slice(0, ALBUM_PEOPLE_MAX))}
            locked={[personId]}
            disabled={save.pending}
          />
          <FormError>{save.error}</FormError>
          <div className="flex gap-2">
            <PendingButton type="submit" size="sm" pending={save.pending} pendingLabel="saving…">
              save
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={save.pending}
              onClick={onClose}
            >
              cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
