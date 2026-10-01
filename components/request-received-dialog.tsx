"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TREE_REQUEST_RECEIVED } from "@/lib/tree-requests";

/**
 * Says an ask to start a tree is in (Step 28). Its own module so the
 * header's switcher, which offers the ask on every page (Step 92.2), fetches
 * it once the page has painted rather than with it (`useStartTree`).
 */
export function RequestReceivedDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request received</DialogTitle>
          <DialogDescription>{TREE_REQUEST_RECEIVED}</DialogDescription>
        </DialogHeader>
        <DialogFooter showCloseButton />
      </DialogContent>
    </Dialog>
  );
}
