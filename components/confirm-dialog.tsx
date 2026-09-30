"use client";

import * as React from "react";

import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { useAction, type RunOptions } from "@/components/use-action";
import { refocusAfterRemoval } from "@/components/use-focus-return";

export type ConfirmProps<T = unknown> = {
  /** The question, as the dialog's title: "Remove this photo from the album?" */
  title: React.ReactNode;
  /**
   * What the reader must know first, if anything; in a string, each line
   * (`\n`) is a paragraph. "This cannot be undone." goes on its own line,
   * and only where something is really lost.
   */
  description?: React.ReactNode;
  /** The button that does it: "Remove". */
  confirmLabel: string;
  /** Shown on it while it runs: "Removing…". */
  pendingLabel?: string;
  /** The button that backs out, first and focused. */
  cancelLabel?: string;
  /** A solid red confirm for a loss; `false` for a change that only can't be reversed. */
  destructive?: boolean;
  /** The server action. The dialog stays open, busy, until it has answered. */
  onConfirm: () => Promise<T>;
  /**
   * Where focus goes when the trigger's row was the list's last: the next
   * row's first button takes it otherwise.
   */
  fallbackFocus?: () => HTMLElement | null | undefined;
} & Pick<RunOptions<T>, "success" | "onSuccess">;

/**
 * Asks before a change that loses something or can't be reversed (Step 70,
 * audit B1), on Base UI's AlertDialog: the question as its title, the safe
 * button first and focused, a solid red confirm. It runs the action itself
 * and closes once the page has redrawn; a refusal shows inside it, by its
 * buttons. Controlled, or give it a `trigger` to open it.
 */
export function ConfirmDialog<T>({
  open,
  onOpenChange,
  trigger,
  title,
  description,
  confirmLabel,
  pendingLabel,
  cancelLabel = "Cancel",
  destructive = true,
  onConfirm,
  fallbackFocus,
  success,
  onSuccess,
  finalFocus,
}: ConfirmProps<T> & {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** The button that opens it, when it isn't opened from elsewhere. */
  trigger?: React.ReactElement;
  /** Where focus goes once it closes, when the trigger itself is gone (a removed row's button). */
  finalFocus?: React.ComponentProps<typeof AlertDialogContent>["finalFocus"];
}) {
  const [ownOpen, setOwnOpen] = React.useState(false);
  const isOpen = open ?? ownOpen;
  const action = useAction({ inline: true });
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  function setOpen(next: boolean) {
    // Nothing backs out of a call already on its way.
    if (!next && action.pending) return;
    if (next) action.setError(null);
    setOwnOpen(next);
    onOpenChange?.(next);
  }

  function confirm() {
    const origin = triggerRef.current;
    action.run("confirm", onConfirm, {
      success,
      onSuccess: (result) => {
        setOwnOpen(false);
        onOpenChange?.(false);
        // A removal takes the trigger's row with it, and the dialog can't
        // hand focus back to a button that's gone: the next row gets it.
        if (origin) refocusAfterRemoval(origin, fallbackFocus);
        onSuccess?.(result);
      },
    });
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={setOpen}>
      {trigger ? <AlertDialogTrigger ref={triggerRef} render={trigger} /> : null}
      <AlertDialogContent initialFocus={cancelRef} finalFocus={finalFocus}>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? (
            <AlertDialogDescription render={<div />} className="flex flex-col gap-2">
              {typeof description === "string"
                ? // Each line its own paragraph: "This cannot be undone."
                  // sits on its own (docs/design-system.md).
                  description
                    .split("\n")
                    .map((line, i) => <p key={i}>{line}</p>)
                : description}
            </AlertDialogDescription>
          ) : null}
        </AlertDialogHeader>
        <FormError>{action.error}</FormError>
        <AlertDialogFooter>
          <AlertDialogClose
            ref={cancelRef}
            disabled={action.pending}
            render={<Button variant="outline" />}
          >
            {cancelLabel}
          </AlertDialogClose>
          <PendingButton
            variant={destructive ? "destructive-solid" : "default"}
            pending={action.pending}
            pendingLabel={pendingLabel}
            onClick={confirm}
          >
            {confirmLabel}
          </PendingButton>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * A button that asks first (`ConfirmDialog`), then runs its action. Takes
 * Button's props for the trigger, and the dialog's in `confirm`.
 */
export function ConfirmButton<T>({
  confirm,
  children,
  ...buttonProps
}: React.ComponentProps<typeof Button> & {
  confirm: ConfirmProps<T> & {
    finalFocus?: React.ComponentProps<typeof ConfirmDialog>["finalFocus"];
  };
}) {
  return (
    <ConfirmDialog
      {...confirm}
      trigger={
        <Button type="button" {...buttonProps}>
          {children}
        </Button>
      }
    />
  );
}
