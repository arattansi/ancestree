"use client";

import * as React from "react";
import { ImagePlus, Loader2, Plus, X } from "lucide-react";

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
  ALBUM_BATCH_MAX,
  ALBUM_DESCRIPTION_MAX,
  ALBUM_PEOPLE_MAX,
  ALBUM_PHOTO_EDGE,
  ALBUM_PHOTO_MAX_MB,
} from "@/lib/limits";
import { readPhotoMetadata, type PhotoMetadata } from "@/lib/photo-metadata";
import { PHOTO_EXTENSIONS } from "@/lib/photo-path";
import { bornYear, rankByTaken, suggestTags } from "@/lib/photo-tags";
import { cn } from "@/lib/utils";

/** The date taken, and whether it's the photo's own, which goes with it. */
type Taken = { value: string; fromPhoto: boolean };

const NO_DATE: Taken = { value: "", fromPhoto: false };

const NOT_SENT = "The photo didn’t upload.";

/** One picked photo and what's said about it, until it's added. */
type Item = {
  key: number;
  name: string;
  /** Shrunk and shown; null while it's being shrunk. */
  file: File | null;
  url: string | null;
  meta: PhotoMetadata | null;
  description: string;
  tagged: string[];
  taken: Taken;
  // "+ Date taken" pressed, or the date typed in: the field stays.
  takenOpened: boolean;
  takenTouched: boolean;
};

/**
 * Add photos to someone's album (Step 88.5): each photo, when it was taken,
 * what it's of, and who's in it, the album's own person always among them.
 * Several may be picked at once (Step 113, up to `ALBUM_BATCH_MAX`); they
 * line up along the top, and each is described, tagged and added in turn,
 * the next one coming up as one goes. Picked photos are shrunk one after
 * another as soon as they're picked, to the album's size, and shown here
 * before they go. A form is its labels. Loaded only once someone opens it.
 *
 * Before one is shrunk, what the photo says about itself is read (Step
 * 88.6): its date taken fills the date in, and the people it names who are
 * on the tree are suggested, those alive when it was taken first. Only the
 * copy drawn afresh goes up, which carries none of it: not where it was
 * taken.
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
  /** One added: the album now, when it could be read. */
  onAdded: (photos: AlbumPhoto[] | undefined) => void;
}) {
  const send = useAction({ inline: true });
  const [items, setItems] = React.useState<Item[]>([]);
  // The photo being described; the first one when it's gone.
  const [currentKey, setCurrentKey] = React.useState<number | null>(null);
  const [pickErrors, setPickErrors] = React.useState<string[]>([]);
  // "+ Date taken" pressed: the day box, which it becomes, takes focus.
  const focusTaken = React.useRef(false);
  const fileRef = React.useRef<HTMLInputElement>(null);
  const nextKey = React.useRef(0);
  // Bumped on closing: photos still being shrunk are dropped.
  const generation = React.useRef(0);
  // Every shown photo's link, let go when it leaves or the dialog closes.
  const urls = React.useRef(new Set<string>());

  // Opened afresh, empty.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setItems([]);
      setCurrentKey(null);
      setPickErrors([]);
      send.setError(null);
    }
  }

  React.useEffect(() => {
    if (open) return;
    generation.current += 1;
    for (const u of urls.current) URL.revokeObjectURL(u);
    urls.current.clear();
  }, [open]);
  React.useEffect(
    () => () => {
      generation.current += 1;
      for (const u of urls.current) URL.revokeObjectURL(u);
    },
    [],
  );

  // The line as it is now, for a photo that drops out after it's shrunk.
  const itemsRef = React.useRef(items);
  React.useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const current = items.find((i) => i.key === currentKey) ?? items[0] ?? null;
  const ready = current?.file ? current : null;

  function update(key: number, change: Partial<Item> | ((item: Item) => Partial<Item>)) {
    setItems((all) =>
      all.map((i) =>
        i.key === key ? { ...i, ...(typeof change === "function" ? change(i) : change) } : i,
      ),
    );
  }

  /** It leaves the line; if it was up, the one after it comes up. */
  function drop(key: number) {
    // Read as it is now: a photo that couldn't be shrunk drops out later.
    const all = itemsRef.current;
    const at = all.findIndex((i) => i.key === key);
    const gone = all[at];
    if (!gone) return;
    if (gone.url) {
      URL.revokeObjectURL(gone.url);
      urls.current.delete(gone.url);
    }
    const rest = all.filter((i) => i.key !== key);
    itemsRef.current = rest;
    setItems((now) => now.filter((i) => i.key !== key));
    const next = rest[Math.min(at, rest.length - 1)]?.key ?? null;
    setCurrentKey((k) => (k === key || k === null ? next : k));
  }

  // Shown while it holds a date: one a photo gave goes with the photo.
  const takenShown = !!current && (current.takenOpened || current.taken.value !== "");
  React.useEffect(() => {
    if (!takenShown || !focusTaken.current) return;
    focusTaken.current = false;
    document.getElementById("album-taken")?.focus();
  }, [takenShown]);

  const takenValue = current?.taken.value ?? "";
  const takenError = takenProblem(takenValue);
  const takenOn = !takenError && takenValue ? takenValue : null;
  const meta = current?.meta ?? null;
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

  /** Shrinks one picked photo; its problem, if it can't go. */
  async function prepare(file: File, key: number, mine: number): Promise<string | null> {
    // Read from the photo as picked, since the shrinking keeps none of it.
    const [small, read] = await Promise.all([
      compressImage(file, { maxEdge: ALBUM_PHOTO_EDGE }),
      readPhotoMetadata(file),
    ]);
    if (generation.current !== mine) return null;
    // Only a photo the browser redrew goes up, never one as picked, which
    // would carry what it says about itself with it. One it couldn't open
    // in a type the album doesn't take (an iPhone's HEIC, outside Safari)
    // is asked for in one it does.
    const problem = !small
      ? PHOTO_EXTENSIONS[file.type]
        ? "couldn’t be read."
        : "choose a JPEG, PNG, or WebP image."
      : small.size > ALBUM_PHOTO_MAX_MB * 1024 * 1024
        ? `photos must be ${ALBUM_PHOTO_MAX_MB}MB or smaller.`
        : null;
    if (problem || !small) {
      drop(key);
      return problem;
    }
    const url = URL.createObjectURL(small);
    urls.current.add(url);
    const photoTaken = read.taken;
    update(key, {
      file: small,
      url,
      meta: read,
      taken: photoTaken ? { value: photoTaken, fromPhoto: true } : NO_DATE,
    });
    return null;
  }

  async function onPick(files: File[]) {
    const mine = generation.current;
    const room = ALBUM_BATCH_MAX - items.length;
    const taken = files.slice(0, Math.max(0, room));
    const errors: string[] =
      files.length > taken.length
        ? [`${ALBUM_BATCH_MAX} photos at a time: ${files.length - taken.length} left out.`]
        : [];
    setPickErrors(errors);
    const added = taken.map(
      (file): Item => ({
        key: nextKey.current++,
        name: file.name,
        file: null,
        url: null,
        meta: null,
        description: "",
        tagged: [personId],
        taken: NO_DATE,
        takenOpened: false,
        takenTouched: false,
      }),
    );
    if (added.length === 0) return;
    itemsRef.current = [...itemsRef.current, ...added];
    setItems((all) => [...all, ...added]);
    if (!current) setCurrentKey(added[0].key);
    // One at a time, so a big pick doesn't hold every photo at full size.
    for (const [i, file] of taken.entries()) {
      const problem = await prepare(file, added[i].key, mine);
      if (generation.current !== mine) return;
      if (problem) {
        errors.push(`${file.name}: ${problem}`);
        setPickErrors([...errors]);
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!current) return;
    update(current.key, { takenTouched: true });
    if (!ready || takenError) return;
    const { key, file, description, tagged } = ready;
    const takenValue = ready.taken.value;
    const last = items.length === 1;
    send.run(
      "send",
      async () => {
        if (!file) return { error: NOT_SENT };
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
          if (last) {
            onOpenChange(false);
          } else {
            drop(key);
          }
        },
      },
    );
  }

  const index = current ? items.indexOf(current) : -1;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!send.pending) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogTitle>
          {items.length > 1 ? `Photo ${index + 1} of ${items.length}` : "Add photos"}
        </DialogTitle>
        <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = "";
              if (files.length > 0) void onPick(files);
            }}
          />
          {items.length === 0 ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="self-start"
              disabled={send.pending}
              onClick={() => fileRef.current?.click()}
            >
              <ImagePlus aria-hidden />
              choose photos
            </Button>
          ) : (
            <div className="flex flex-col gap-2">
              <ul className="flex gap-2 overflow-x-auto pb-1" aria-label="Picked photos">
                {items.map((item, i) => (
                  <li key={item.key} className="shrink-0">
                    <button
                      type="button"
                      aria-label={`Photo ${i + 1}: ${item.name}`}
                      aria-current={item === current ? "true" : undefined}
                      disabled={send.pending}
                      onClick={() => setCurrentKey(item.key)}
                      className={cn(
                        "flex size-14 items-center justify-center overflow-hidden rounded-md border bg-muted outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                        item === current && "ring-2 ring-primary",
                      )}
                    >
                      {item.url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- a picked file
                        <img src={item.url} alt="" className="size-full object-cover" />
                      ) : (
                        <Loader2 aria-hidden className="size-4 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  </li>
                ))}
                {items.length < ALBUM_BATCH_MAX ? (
                  <li className="shrink-0">
                    <button
                      type="button"
                      aria-label="Choose more photos"
                      disabled={send.pending}
                      onClick={() => fileRef.current?.click()}
                      className="flex size-14 items-center justify-center rounded-md border border-dashed text-muted-foreground outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Plus aria-hidden className="size-4" />
                    </button>
                  </li>
                ) : null}
              </ul>
              {ready?.url ? (
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
                    onClick={() => drop(ready.key)}
                  >
                    <X aria-hidden />
                    remove
                  </Button>
                </div>
              ) : (
                <p className="flex h-24 items-center justify-center rounded-md border text-sm text-muted-foreground">
                  preparing…
                </p>
              )}
            </div>
          )}
          {pickErrors.map((error) => (
            <FormError key={error}>{error}</FormError>
          ))}
          {current ? (
            <>
              {takenShown ? (
                <div className="flex flex-col gap-2">
                  <Label htmlFor="album-taken">Date taken</Label>
                  <DateField
                    key={current.key}
                    id="album-taken"
                    value={current.taken.value}
                    onChange={(value) =>
                      update(current.key, {
                        taken: { value, fromPhoto: false },
                        takenOpened: true,
                      })
                    }
                    onBlur={() => update(current.key, { takenTouched: true })}
                    disabled={send.pending}
                    aria-invalid={current.takenTouched && !!takenError}
                  />
                  <FormError>{current.takenTouched ? takenError : null}</FormError>
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
                    update(current.key, { takenOpened: true });
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
                  value={current.description}
                  onChange={(e) => update(current.key, { description: e.target.value })}
                  rows={3}
                  maxLength={ALBUM_DESCRIPTION_MAX}
                  disabled={send.pending}
                />
              </div>
              <CompanionPicker
                key={current.key}
                label="Who’s in it"
                options={ranked}
                suggested={suggested}
                value={current.tagged}
                onChange={(ids) =>
                  update(current.key, { tagged: ids.slice(0, ALBUM_PEOPLE_MAX) })
                }
                locked={[personId]}
                disabled={send.pending}
              />
            </>
          ) : null}
          <FormError>{send.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              type="submit"
              size="sm"
              pending={send.pending}
              disabled={!ready}
              pendingLabel="adding…"
            >
              {items.length > 1 ? "add, then next" : "add"}
            </PendingButton>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={send.pending}
              onClick={() => onOpenChange(false)}
            >
              {items.length > 1 ? "close" : "cancel"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
