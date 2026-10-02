"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";

import {
  decideAlbumPhoto,
  deleteAlbumPhoto,
  removeFromAlbum,
} from "@/app/actions/album";
import { ActionButton } from "@/components/action-button";
import { ConfirmButton } from "@/components/confirm-dialog";
import type { CompanionOption } from "@/components/tree/companion-picker";
import {
  invalidatePersonSheet,
  setPersonSheet,
  usePersonSheet,
} from "@/components/tree/use-person-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { AlbumPhoto } from "@/lib/album";
import { formatPartialDate } from "@/lib/partial-date";
import { timeAgo } from "@/lib/time-ago";

// Opened by a press, so it and what it loads wait for one (Step 87.4).
const AlbumDialog = dynamic(
  () => import("@/components/tree/album-dialog").then((m) => m.AlbumDialog),
  { ssr: false },
);

/** Who else is in a photo, as far as the viewer may see. */
function withLine(others: AlbumPhoto["others"]): string | null {
  if (others.length === 0) return null;
  const names = others.map((o) =>
    o.status === "pending"
      ? `${o.name} (waiting)`
      : o.status === "declined"
        ? `${o.name} (not approved)`
        : o.name,
  );
  return `With ${names.join(", ")}`;
}

/**
 * What's under the photo in view: who added it and when, whether it's in
 * the album yet, what it's of, when it was taken, who else is in it, and
 * what the viewer may do with it. Whoever approves the person's photos
 * answers a waiting one here; it can be taken out of the album by its
 * uploader, by whoever approves them, or by whoever can edit the entry; its
 * uploader may delete it from every album.
 */
function PhotoDetails({
  photo,
  personId,
  position,
  onDecided,
  onGone,
}: {
  photo: AlbumPhoto;
  personId: string;
  /** "2 / 7", when there's more than one. */
  position: string | null;
  onDecided: (approved: boolean) => void;
  onGone: () => void;
}) {
  const others = withLine(photo.others);
  const taken = formatPartialDate(photo.takenOn, photo.takenPrecision);
  // Its uploader deleting it is the same as taking it out, and more, when
  // it's in nobody else's album they can see.
  const canRemove = photo.canRemove && !(photo.mine && photo.others.length === 0);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span className="font-medium text-foreground">
          {photo.mine ? "You" : photo.addedBy}
        </span>
        <span>{timeAgo(photo.createdAt)}</span>
        {photo.status === "pending" ? (
          <Badge variant="secondary">Waiting for approval</Badge>
        ) : photo.status === "declined" ? (
          <Badge variant="destructive">Not approved</Badge>
        ) : null}
        {position ? (
          <span className="ml-auto tabular-nums" aria-hidden>
            {position}
          </span>
        ) : null}
      </div>
      {photo.description ? (
        <p className="whitespace-pre-wrap">{photo.description}</p>
      ) : null}
      {taken ? <p className="text-xs text-muted-foreground">Taken {taken}</p> : null}
      {others ? <p className="text-xs text-muted-foreground">{others}</p> : null}
      <div className="flex flex-wrap gap-2 empty:hidden">
        {photo.canDecide ? (
          <>
            <ActionButton
              size="sm"
              action={() => decideAlbumPhoto(photo.id, personId, true)}
              pendingLabel="approving…"
              onSuccess={() => onDecided(true)}
            >
              approve
            </ActionButton>
            <ActionButton
              size="sm"
              variant="outline"
              action={() => decideAlbumPhoto(photo.id, personId, false)}
              pendingLabel="declining…"
              removesRow={!photo.mine}
              onSuccess={() => onDecided(false)}
            >
              decline
            </ActionButton>
          </>
        ) : null}
        {canRemove ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            confirm={{
              title: "Remove this photo from the album?",
              confirmLabel: "remove",
              pendingLabel: "removing…",
              onConfirm: () => removeFromAlbum(photo.id, personId),
              onSuccess: onGone,
            }}
          >
            remove
          </ConfirmButton>
        ) : null}
        {photo.mine ? (
          <ConfirmButton
            size="sm"
            variant="ghost"
            className="text-destructive"
            confirm={{
              title: "Delete this photo?",
              description:
                photo.others.length > 0
                  ? "It goes from every album it’s in.\nThis cannot be undone."
                  : "This cannot be undone.",
              confirmLabel: "delete",
              pendingLabel: "deleting…",
              onConfirm: () => deleteAlbumPhoto(photo.id),
              onSuccess: onGone,
            }}
          >
            delete
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}

/**
 * The album as a carousel (Step 88.5): one photo at a time across the
 * sheet, swiped or stepped through, its details underneath. A press on the
 * photo shows the whole of it.
 */
function AlbumCarousel({
  photos,
  personId,
  onDecided,
  onGone,
}: {
  photos: AlbumPhoto[];
  personId: string;
  onDecided: (photo: AlbumPhoto, approved: boolean) => void;
  onGone: (photo: AlbumPhoto) => void;
}) {
  const stripRef = React.useRef<HTMLUListElement>(null);
  const [index, setIndex] = React.useState(0);
  const [viewing, setViewing] = React.useState<AlbumPhoto | null>(null);
  const count = photos.length;
  // One gone from under it, and the one now in its place is in view.
  const at = Math.min(index, count - 1);
  const photo = photos[at];

  // Wherever the strip has come to rest, by a swipe or a step.
  function onScroll() {
    const strip = stripRef.current;
    if (!strip || strip.clientWidth === 0) return;
    const next = Math.round(strip.scrollLeft / strip.clientWidth);
    setIndex(Math.max(0, Math.min(count - 1, next)));
  }

  function go(to: number) {
    const strip = stripRef.current;
    const next = Math.max(0, Math.min(count - 1, to));
    setIndex(next);
    if (!strip) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    strip.scrollTo({ left: next * strip.clientWidth, behavior: still ? "auto" : "smooth" });
  }

  if (!photo) return null;
  return (
    <div
      role="region"
      aria-roledescription="carousel"
      aria-label="Album"
      className="flex flex-col gap-3"
      onKeyDown={(e) => {
        if (e.target instanceof HTMLElement && e.target.closest("[role=alertdialog]")) return;
        if (e.key === "ArrowLeft" && at > 0) {
          e.preventDefault();
          go(at - 1);
        } else if (e.key === "ArrowRight" && at < count - 1) {
          e.preventDefault();
          go(at + 1);
        }
      }}
    >
      <div className="relative">
        <ul
          ref={stripRef}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {photos.map((p, i) => (
            <li
              key={p.id}
              className="w-full shrink-0 snap-center snap-always"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              inert={i !== at}
            >
              <button
                type="button"
                className="block aspect-square w-full cursor-zoom-in bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                aria-label="View the whole photo"
                onClick={() => setViewing(p)}
              >
                {p.url ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
                  <img
                    src={p.url}
                    alt={p.description ?? ""}
                    loading={Math.abs(i - at) <= 1 ? "eager" : "lazy"}
                    className="size-full object-contain"
                  />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
        {count > 1 ? (
          <>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full opacity-90 tap-target disabled:invisible"
              aria-label="Previous photo"
              disabled={at === 0}
              onClick={() => go(at - 1)}
            >
              <ChevronLeft aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon-sm"
              variant="secondary"
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full opacity-90 tap-target disabled:invisible"
              aria-label="Next photo"
              disabled={at === count - 1}
              onClick={() => go(at + 1)}
            >
              <ChevronRight aria-hidden />
            </Button>
          </>
        ) : null}
      </div>

      <PhotoDetails
        key={photo.id}
        photo={photo}
        personId={personId}
        position={count > 1 ? `${at + 1} / ${count}` : null}
        onDecided={(approved) => onDecided(photo, approved)}
        onGone={() => onGone(photo)}
      />

      <Dialog open={viewing !== null} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent className="w-fit max-w-[calc(100%-2rem)] bg-transparent p-0 ring-0 sm:max-w-3xl">
          <DialogTitle className="sr-only">Photo</DialogTitle>
          {viewing?.fullUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- a signed storage link
            <img
              src={viewing.fullUrl}
              alt={viewing.description ?? ""}
              className="max-h-[85dvh] w-auto rounded-xl object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Someone's album (Step 88.5), in place of the documents it replaced: the
 * photos they're in that the viewer may see, newest first, and a way for
 * anyone on the tree to add one. Read when the entry opens
 * (`useLoadPersonSheet`, Step 87.6); added, answered and removed here, so
 * the album keeps itself without the page being drawn again.
 */
export function EntryAlbum({
  personId,
  treeId,
  people,
}: {
  personId: string;
  /** The tree it's read on, which a new photo is added on. */
  treeId: string;
  /** Everyone on the canvas, who may be tagged in a new photo. */
  people: CompanionOption[];
}) {
  // Read with the rest of the sheet when it opens (Step 87.6).
  const sheet = usePersonSheet(personId);
  const [adding, setAdding] = React.useState(false);
  // Mounted from the first press on, so it can close with its animation.
  const [dialogMounted, setDialogMounted] = React.useState(false);
  // A photo just added is the newest: the carousel starts over, on it.
  const [added, setAdded] = React.useState(0);

  // The album of the person being viewed; `null` while loading.
  const items = sheet?.sheet.album ?? null;
  const failed = items === null && !!sheet?.failed.includes("album");

  // Another person, and what was being added for the last one goes.
  const [prevPerson, setPrevPerson] = React.useState(personId);
  if (personId !== prevPerson) {
    setPrevPerson(personId);
    setAdding(false);
  }

  function update(change: (items: AlbumPhoto[]) => AlbumPhoto[]) {
    setPersonSheet(personId, "album", (all) => all && change(all));
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby="album-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="album-heading" className="text-sm font-semibold">
          Album
        </h2>
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setDialogMounted(true);
            setAdding(true);
          }}
        >
          <Plus aria-hidden />
          add
        </Button>
      </div>

      {failed ? (
        <p className="text-sm text-muted-foreground">
          Couldn’t load the album.{" "}
          <button
            type="button"
            className="font-medium underline underline-offset-2"
            onClick={() => invalidatePersonSheet(personId, ["album"])}
          >
            try again
          </button>
        </p>
      ) : items === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">No photos yet.</p>
      ) : (
        <AlbumCarousel
          key={`${personId}:${added}`}
          photos={items}
          personId={personId}
          onDecided={(photo, approved) =>
            update((all) =>
              approved || photo.mine
                ? all.map((p) =>
                    p.id === photo.id
                      ? { ...p, status: approved ? "approved" : "declined", canDecide: false }
                      : p,
                  )
                : // Declined, it's its uploader's alone to see.
                  all.filter((p) => p.id !== photo.id),
            )
          }
          onGone={(photo) => update((all) => all.filter((p) => p.id !== photo.id))}
        />
      )}

      {dialogMounted ? (
        <AlbumDialog
          open={adding}
          onOpenChange={setAdding}
          personId={personId}
          treeId={treeId}
          people={people}
          onAdded={(photos) => {
            setAdded((n) => n + 1);
            if (photos) {
              setPersonSheet(personId, "album", () => photos);
            } else {
              invalidatePersonSheet(personId, ["album"]);
            }
          }}
        />
      ) : null}
    </section>
  );
}
