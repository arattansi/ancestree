"use client";

import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { addRelativeHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";

/**
 * "Add a relative", sized to be found (Step 19.2): a 44px target with its
 * label spelled out from `sm` up, where testers missed the old symbol-only
 * button. With someone selected it starts the add flow connected to them.
 */
export function AddRelativeButton({
  relatedTo,
  labelFrom = "always",
  className,
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
}) {
  const label = relatedTo
    ? `Add a relative of ${relatedTo.name}`
    : "Add a relative";
  return (
    <Button
      nativeButton={false}
      render={<Link href={addRelativeHref(relatedTo?.id)} />}
      size="lg"
      className={cn(
        "h-11 min-w-11 gap-2 px-3 text-sm shadow-md sm:px-4",
        className,
      )}
      aria-label={label}
      title={label}
    >
      <Plus className="size-5" aria-hidden />
      <span
        className={cn(
          "max-w-60 truncate",
          labelFrom === "sm" && "hidden sm:inline",
          labelFrom === "lg" && "hidden lg:inline",
        )}
      >
        {label}
      </span>
    </Button>
  );
}
