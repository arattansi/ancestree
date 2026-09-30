"use client";

import * as React from "react";
import { ImagePlus, X } from "lucide-react";

import { addAlbumPhoto } from "@/app/actions/album";
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
import { isRedirect } from "@/lib/action-feedback";
import type { AlbumPhoto } from "@/lib/album";
import { albumPath } from "@/lib/album-path";
import { compressImage } from "@/lib/image";
import {
  ALBUM_DESCRIPTION_MAX,
  ALBUM_PEOPLE_MAX,
  ALBUM_PHOTO_EDGE,
  ALBUM_PHOTO_MAX_MB,
} from "@/lib/limits";

type Picked =
  | { state: "preparing" }
  | { state: "ready"; file: File; url: string };

const NOT_SENT = "The photo didn’t upload.";

/**
 * Add a photo to someone's album (Step 88.5): the photo, what it's of, and
 * who's in it, the album's own person always among them. A picked photo is
 * shrunk as soon as it's picked, to the album's size, and shown here before
 * it goes. A form is its labels. Loaded only once someone opens it.
 */
export function AlbumDialog({
  open,
  onOpenChange,
  personId,
  treeId,
  people,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  personId: string;
  /** The tree it's added on, whose inbox its uploader hears back in. */
  treeId: string;
  /** Everyone on the canvas, who may be tagged. */
  people: CompanionOption[];
  /** Added: the album now, when it could be read. */
  onAdded: (photos: AlbumPhoto[] | undefined) => void;
}) {
  const send = useAction({ inline: true });
  const [picked, setPicked] = React.useState<Picked | null>(null);
  const [pickError, setPickError] = React.useState<string | null>(null);
  const [description, setDescription] = React.useState("");
  const [tagged, setTagged] = React.useState<string[]>([personId]);
  const fileRef = React.useRef<HTMLInputElement>(null);
  // Which pick is being prepared: a later pick, or a closed dialog, drops
  // an earlier one's result.
  const pick = React.useRef(0);

  // Opened afresh, empty, with only the album's own person in it.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPicked(null);
      setPickError(null);
      setDescription("");
      setTagged([personId]);
      send.setError(null);
    }
  }

  // A shown photo's link goes with it.
  const url = picked?.state === "ready" ? picked.url : null;
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  React.useEffect(() => {
    if (!open) pick.current += 1;
  }, [open]);

  async function onPick(file: File) {
    const mine = ++pick.current;
    setPickError(null);
    setPicked({ state: "preparing" });
    let small: File | null = null;
    try {
      small = await compressImage(file, { maxEdge: ALBUM_PHOTO_EDGE });
    } catch {
      small = null;
    }
    if (pick.current !== mine) return;
    // A photo the browser couldn't open (an iPhone's HEIC, outside Safari)
    // comes back as it was, which the album won't take.
    const problem = !small
      ? "That photo couldn’t be read."
      : !albumPath(treeId, small.type)
        ? "Choose a JPEG, PNG, or WebP image."
        : small.size > ALBUM_PHOTO_MAX_MB * 1024 * 1024
          ? `Photos must be ${ALBUM_PHOTO_MAX_MB}MB or smaller.`
          : null;
    if (problem || !small) {
      setPicked(null);
      setPickError(problem);
      return;
    }
    setPicked({ state: "ready", file: small, url: URL.createObjectURL(small) });
  }

  const ready = picked?.state === "ready" ? picked : null;
  const preparing = picked?.state === "preparing";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    const file = ready.file;
    send.run(
      "send",
      async () => {
        const path = albumPath(treeId, file.type);
        if (!path) return { error: NOT_SENT };
        const { createClient } = await import("@/lib/supabase/client");
        const { error } = await createClient()
          .storage.from("album")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) return { error: NOT_SENT };
        try {
          // Refused, it takes the upload away again itself.
          return await addAlbumPhoto({ personId, treeId, path, description, people: tagged });
        } catch (thrown) {
          // Unreachable: the photo may have arrived, so the upload stays.
          if (isRedirect(thrown)) throw thrown;
          return { error: "Couldn’t add it. Try again." };
        }
      },
      {
        success: (res) => (res.pending ? "Sent for approval." : null),
        onSuccess: (res) => {
          onAdded(res.photos);
          onOpenChange(false);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!send.pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>Add a photo</DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          <div className="flex flex-col gap-2">
            <span className="text-sm font-medium">Photo</span>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void onPick(file);
              }}
            />
            {ready ? (
              <div className="flex flex-col gap-2 rounded-md border p-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- a picked file */}
                <img
                  src={ready.url}
                  alt=""
                  className="max-h-72 w-full rounded bg-muted object-contain"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="self-end"
                  disabled={send.pending}
                  onClick={() => setPicked(null)}
                >
                  <X aria-hidden />
                  Remove
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="self-start"
                disabled={preparing || send.pending}
                onClick={() => fileRef.current?.click()}
              >
                <ImagePlus aria-hidden />
                {preparing ? "Preparing…" : "Choose a photo"}
              </Button>
            )}
            <FormError>{pickError}</FormError>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="album-description">Description</Label>
            <Textarea
              id="album-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={ALBUM_DESCRIPTION_MAX}
              disabled={send.pending}
            />
          </div>
          <CompanionPicker
            label="Who’s in it"
            options={people}
            value={tagged}
            onChange={(ids) => setTagged(ids.slice(0, ALBUM_PEOPLE_MAX))}
            locked={[personId]}
            disabled={send.pending}
          />
          <FormError>{send.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={send.pending}
              disabled={!ready}
              pendingLabel="Adding…"
            >
              Add
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={send.pending}
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
