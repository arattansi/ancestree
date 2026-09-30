"use client";

import * as React from "react";
import { ImagePlus, Plus, X } from "lucide-react";

import { addAlbumPhoto } from "@/app/actions/album";
import { DateField } from "@/components/date-field";
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
import { takenProblem } from "@/lib/album-taken";
import { compressImage } from "@/lib/image";
import {
  ALBUM_DESCRIPTION_MAX,
  ALBUM_PEOPLE_MAX,
  ALBUM_PHOTO_EDGE,
  ALBUM_PHOTO_MAX_MB,
} from "@/lib/limits";
import { readPhotoMetadata, type PhotoMetadata } from "@/lib/photo-metadata";
import { PHOTO_EXTENSIONS } from "@/lib/photo-path";
import { bornYear, rankByTaken, suggestTags } from "@/lib/photo-tags";

type Picked =
  | { state: "preparing" }
  | { state: "ready"; file: File; url: string };

/** The date taken, and whether it's the photo's own, which goes with it. */
type Taken = { value: string; fromPhoto: boolean };

const NO_DATE: Taken = { value: "", fromPhoto: false };

const NOT_SENT = "The photo didn’t upload.";

/**
 * Add a photo to someone's album (Step 88.5): the photo, when it was taken,
 * what it's of, and who's in it, the album's own person always among them.
 * A picked photo is shrunk as soon as it's picked, to the album's size, and
 * shown here before it goes. A form is its labels. Loaded only once someone
 * opens it.
 *
 * Before it's shrunk, what the photo says about itself is read (Step 88.6):
 * its date taken fills the date in, and the people it names who are on the
 * tree are suggested, those alive when it was taken first. Only the copy
 * drawn afresh goes up, which carries none of it: not where it was taken.
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
  const [meta, setMeta] = React.useState<PhotoMetadata | null>(null);
  const [taken, setTaken] = React.useState<Taken>(NO_DATE);
  // "+ Date taken" pressed, or the date typed in: the field stays.
  const [takenOpened, setTakenOpened] = React.useState(false);
  const [takenTouched, setTakenTouched] = React.useState(false);
  // "+ Date taken" pressed: the day box, which it becomes, takes focus.
  const focusTaken = React.useRef(false);
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
      setMeta(null);
      setTaken(NO_DATE);
      setTakenOpened(false);
      setTakenTouched(false);
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

  // Shown while it holds a date: one a photo gave goes with the photo.
  const takenShown = takenOpened || taken.value !== "";
  React.useEffect(() => {
    if (!takenShown || !focusTaken.current) return;
    focusTaken.current = false;
    document.getElementById("album-taken")?.focus();
  }, [takenShown]);

  const takenError = takenProblem(taken.value);
  const takenOn = !takenError && taken.value ? taken.value : null;
  // Those alive when it was taken first, wherever names are listed.
  const ranked = React.useMemo(() => rankByTaken(people, takenOn), [people, takenOn]);
  const suggested = React.useMemo(() => {
    if (!meta || meta.names.length === 0) return [];
    const byId = new Map(people.map((o) => [o.id, o]));
    const labels = new Map<string, number>();
    for (const o of people) labels.set(o.label, (labels.get(o.label) ?? 0) + 1);
    return suggestTags(meta.names, people, takenOn).flatMap((id) => {
      const o = byId.get(id);
      if (!o) return [];
      // Two of one name are told apart by when they were born.
      const born = (labels.get(o.label) ?? 0) > 1 ? bornYear(o.person) : null;
      return [born ? { ...o, label: `${o.label} (${born})` } : o];
    });
  }, [meta, people, takenOn]);

  /** The photo's own date goes with it; one typed stays. */
  function dropPhotoDate() {
    setTaken((t) => (t.fromPhoto ? NO_DATE : t));
  }

  async function onPick(file: File) {
    const mine = ++pick.current;
    setPickError(null);
    setPicked({ state: "preparing" });
    // Read from the photo as picked, since the shrinking keeps none of it.
    const [small, read] = await Promise.all([
      compressImage(file, { maxEdge: ALBUM_PHOTO_EDGE }),
      readPhotoMetadata(file),
    ]);
    if (pick.current !== mine) return;
    // Only a photo the browser redrew goes up, never one as picked, which
    // would carry what it says about itself with it. One it couldn't open
    // in a type the album doesn't take (an iPhone's HEIC, outside Safari)
    // is asked for in one it does.
    const problem = !small
      ? PHOTO_EXTENSIONS[file.type]
        ? "That photo couldn’t be read."
        : "Choose a JPEG, PNG, or WebP image."
      : small.size > ALBUM_PHOTO_MAX_MB * 1024 * 1024
        ? `Photos must be ${ALBUM_PHOTO_MAX_MB}MB or smaller.`
        : null;
    if (problem || !small) {
      setPicked(null);
      setMeta(null);
      dropPhotoDate();
      setPickError(problem);
      return;
    }
    setPicked({ state: "ready", file: small, url: URL.createObjectURL(small) });
    setMeta(read);
    const photoTaken = read.taken;
    if (photoTaken) {
      // Unless one's been typed, which stays.
      setTaken((t) => (!t.value || t.fromPhoto ? { value: photoTaken, fromPhoto: true } : t));
    } else {
      dropPhotoDate();
    }
  }

  const ready = picked?.state === "ready" ? picked : null;
  const preparing = picked?.state === "preparing";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTakenTouched(true);
    if (!ready || takenError) return;
    const file = ready.file;
    const takenValue = taken.value;
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
          return await addAlbumPhoto({
            personId,
            treeId,
            path,
            description,
            people: tagged,
            taken: takenValue,
          });
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
                  onClick={() => {
                    setPicked(null);
                    setMeta(null);
                    dropPhotoDate();
                  }}
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
          {takenShown ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="album-taken">Date taken</Label>
              <DateField
                id="album-taken"
                value={taken.value}
                onChange={(value) => {
                  setTaken({ value, fromPhoto: false });
                  setTakenOpened(true);
                }}
                onBlur={() => setTakenTouched(true)}
                disabled={send.pending}
                aria-invalid={takenTouched && !!takenError}
              />
              <FormError>{takenTouched ? takenError : null}</FormError>
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="self-start px-0"
              disabled={send.pending}
              onClick={() => {
                focusTaken.current = true;
                setTakenOpened(true);
              }}
            >
              <Plus aria-hidden />
              Date taken
            </Button>
          )}
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
            options={ranked}
            suggested={suggested}
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
