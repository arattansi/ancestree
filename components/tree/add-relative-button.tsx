"use client";

import Link from "next/link";
import { Loader2Icon, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addRelativeHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";

/**
 * "Add a relative", sized to be found (Step 19.2): a 44px target with its
 * label spelled out from `sm` up, where testers missed the old symbol-only
 * button. With someone selected it starts the add flow connected to them.
 * With `onClick` it's a button rather than a link to the flow, for My
 * Family Tree, which asks which tree first or switches to it (Step 92.3).
 */
export function AddRelativeButton({
  relatedTo,
  labelFrom = "always",
  className,
  onClick,
  pending = false,
}: {
  /** The selected person, whose relative this will be. */
  relatedTo: { id: string; name: string } | null;
  /**
   * The width from which the words show; below it, just the symbol (still
   * named by `aria-label` and `title`). `lg` for beside the details sheet,
   * where a narrower canvas leaves the search box no room.
   */
  labelFrom?: "always" | "sm" | "lg";
  className?: string;
  /** What pressing it does, in place of opening the add flow. */
  onClick?: () => void;
  /** `onClick`'s work is running: busy until the next page arrives. */
  pending?: boolean;
}) {
  const label = relatedTo
    ? `add a relative of ${relatedTo.name}`
    : "add a relative";
  const look = {
    size: "lg" as const,
    className: cn(
      "h-11 min-w-11 gap-2 px-3 text-sm shadow-md sm:px-4",
      className,
    ),
    "aria-label": label,
    title: label,
    // Where focus goes when the details sheet closes on an entry that's
    // just been deleted, with no card left to return to (Step 70).
    "data-add-relative": "",
  };
  const content = (
    <>
      {pending ? (
        <Loader2Icon className="size-5 animate-spin" aria-hidden />
      ) : (
        <Plus className="size-5" aria-hidden />
      )}
      <span
        className={cn(
          "max-w-60 truncate",
          labelFrom === "sm" && "hidden sm:inline",
          labelFrom === "lg" && "hidden lg:inline",
        )}
      >
        {label}
      </span>
    </>
  );
  if (onClick) {
    return (
      <Button
        type="button"
        onClick={onClick}
        disabled={pending}
        // Busy, it keeps focus (Step 70, audit B7).
        focusableWhenDisabled={pending}
        aria-busy={pending || undefined}
        {...look}
      >
        {content}
      </Button>
    );
  }
  return (
    <Button
      nativeButton={false}
      render={<Link href={addRelativeHref(relatedTo?.id)} />}
      {...look}
    >
      {content}
    </Button>
  );
}
