"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { BookOpen, ImagePlus, Loader2Icon, Plus, UserPlus } from "lucide-react";

import type { CompanionOption } from "@/components/tree/companion-picker";
import { TreeMarkDot } from "@/components/tree/tree-mark";
import { invalidatePersonSheet } from "@/components/tree/use-person-sheet";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { TreeMark } from "@/lib/my-family";
import { cn } from "@/lib/utils";

// Opened by a press, so they and what they load wait for one.
const AlbumDialog = dynamic(
  () => import("@/components/tree/album-dialog").then((m) => m.AlbumDialog),
  { ssr: false },
);
const StoryDialog = dynamic(
  () => import("@/components/tree/story-dialog").then((m) => m.StoryDialog),
  { ssr: false },
);

/** Where photos and stories from the + go (Step 145). */
export type AddMedia = {
  /** The trees they may go on, in the key's order; asked when there's more than one. */
  trees: { id: string; name: string; mark?: TreeMark }[];
  /** Who may be tagged in one, or told about, on a tree: those it shows in full. */
  peopleOn: (treeId: string) => CompanionOption[];
};

/** What "Relative" does: opens the add flow, or what `onClick` does. */
export type AddRelative =
  | { href: string }
  | { onClick: () => void; pending: boolean };

type Kind = "photos" | "story";

// Getting Started's "Share a story or photo" (Step 170) opens the canvas's
// own + rather than going anywhere: the + that `answersRequests` listens.
const openRequests = new Set<() => void>();

/** Opens the canvas's + (Step 170); `false` when there's none to open. */
export function openAddMenu(): boolean {
  for (const open of openRequests) open();
  return openRequests.size > 0;
}

/**
 * The canvas's + (Step 145), where **Add a relative** was: a relative,
 * photos or a story. A relative goes to the add flow, connected to
 * `relatedTo` if anyone; photos and a story open their dialogs over the
 * canvas, with whoever is selected tagged in them or told about to start
 * with, and ask who's in them or whom it's about. Sized to be found, as
 * Add a relative was (Step 19.2): a 44px target, its word from `sm` up.
 */
export function AddMenu({
  relatedTo,
  subject,
  relative,
  media,
  labelFrom = "always",
  answersRequests = false,
  className,
}: {
  /** Whose relative it adds, or nobody's. */
  relatedTo: { id: string; name: string } | null;
  /** Who photos and a story start with: the selected person. */
  subject: { id: string; name: string } | null;
  /** Null: the viewer may add no relative here. */
  relative: AddRelative | null;
  /** Null: no photos or stories here. */
  media: AddMedia | null;
  /**
   * The width from which the word shows; below it, just the symbol (still
   * named by `aria-label` and `title`). `lg` for beside the details sheet.
   */
  labelFrom?: "always" | "sm" | "lg";
  /** The canvas's own +, which `openAddMenu` opens (Step 170). */
  answersRequests?: boolean;
  className?: string;
}) {
  const [menuOpen, setMenuOpen] = React.useState(false);
  React.useEffect(() => {
    if (!answersRequests) return;
    const open = () => setMenuOpen(true);
    openRequests.add(open);
    return () => {
      openRequests.delete(open);
    };
  }, [answersRequests]);
  const [kind, setKind] = React.useState<Kind | null>(null);
  // Mounted from the first press on, so they close with their animation.
  const [mounted, setMounted] = React.useState<Record<Kind, boolean>>({
    photos: false,
    story: false,
  });
  const [treeId, setTreeId] = React.useState<string | null>(null);
  // Which tree, asked when there's a choice.
  const [asking, setAsking] = React.useState<Kind | null>(null);

  const only = media?.trees.length === 1 ? media.trees[0] : null;
  // Named in the menu only where they'll be picked to start with.
  const subjectShown =
    subject && only && media?.peopleOn(only.id).some((p) => p.id === subject.id)
      ? subject
      : null;
  const people = React.useMemo(
    () => (media && treeId ? media.peopleOn(treeId) : []),
    [media, treeId],
  );
  const first = subject && people.some((p) => p.id === subject.id) ? subject.id : null;
  const pending = !!relative && "pending" in relative && relative.pending;

  function open(next: Kind, tree: string) {
    setTreeId(tree);
    setMounted((m) => ({ ...m, [next]: true }));
    setKind(next);
  }

  function choose(next: Kind) {
    if (!media) return;
    if (only) open(next, only.id);
    else setAsking(next);
  }

  if (!relative && !media) return null;

  const word = (
    <span
      className={cn(
        "max-w-60 truncate",
        labelFrom === "sm" && "hidden sm:inline",
        labelFrom === "lg" && "hidden lg:inline",
      )}
    >
      add
    </span>
  );
  const relativeLabel = relatedTo ? `Relative of ${relatedTo.name}` : "Relative";

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger
          disabled={pending}
          aria-busy={pending || undefined}
          aria-label="add"
          title="add"
          // Where focus goes when the details sheet closes on an entry
          // that's just been deleted, with no card left to return to (Step 70).
          data-add-relative=""
          render={
            <Button
              size="lg"
              className={cn(
                "h-11 min-w-11 gap-2 px-3 text-sm shadow-md sm:px-4",
                className,
              )}
            />
          }
        >
          {pending ? (
            <Loader2Icon className="size-5 animate-spin" aria-hidden />
          ) : (
            <Plus className="size-5" aria-hidden />
          )}
          {word}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-auto min-w-48 max-w-72">
          {relative ? (
            "href" in relative ? (
              <DropdownMenuItem render={<Link href={relative.href} />}>
                <UserPlus aria-hidden />
                <span className="min-w-0 truncate">{relativeLabel}</span>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={relative.onClick}>
                <UserPlus aria-hidden />
                <span className="min-w-0 truncate">{relativeLabel}</span>
              </DropdownMenuItem>
            )
          ) : null}
          {media ? (
            <>
              <DropdownMenuItem onClick={() => choose("photos")}>
                <ImagePlus aria-hidden />
                <span className="min-w-0 truncate">
                  {subjectShown ? `Photos of ${subjectShown.name}` : "Photos"}
                </span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => choose("story")}>
                <BookOpen aria-hidden />
                <span className="min-w-0 truncate">
                  {subjectShown ? `Story about ${subjectShown.name}` : "Story"}
                </span>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {media && media.trees.length > 1 ? (
        <Dialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogTitle>Which tree?</DialogTitle>
            <ul className="flex flex-col gap-2">
              {media.trees.map((t) => (
                <li key={t.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 w-full justify-start px-3 py-2 text-left whitespace-normal"
                    onClick={() => {
                      const next = asking;
                      setAsking(null);
                      if (next) open(next, t.id);
                    }}
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      {t.mark ? <TreeMarkDot mark={t.mark} /> : null}
                      <span className="min-w-0 break-words">{t.name}</span>
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
          </DialogContent>
        </Dialog>
      ) : null}

      {mounted.photos && treeId ? (
        <AlbumDialog
          open={kind === "photos"}
          onOpenChange={(o) => setKind(o ? "photos" : null)}
          personId={null}
          tagFirst={first}
          treeId={treeId}
          people={people}
          // Their albums are read again, when next open if not now.
          onAdded={(_, tagged) => {
            for (const id of tagged) invalidatePersonSheet(id, ["album"]);
          }}
        />
      ) : null}
      {mounted.story && treeId ? (
        <StoryDialog
          open={kind === "story"}
          onOpenChange={(o) => setKind(o ? "story" : null)}
          personId={first}
          chooseAbout
          treeId={treeId}
          people={people}
          // Theirs are read again, when next open if not now.
          onTold={(_, __, about) => {
            for (const id of about) invalidatePersonSheet(id, ["stories"]);
          }}
        />
      ) : null}
    </>
  );
}
