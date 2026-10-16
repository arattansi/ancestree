"use client";

import { AccountTypeGuide } from "@/components/account-type-guide";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Who can do what", drawn as a link, opening every account type side by
 * side (Step 171, audit R10): the guide on demand, where the founder's
 * invite step used to keep it open beside the forms (Step 29).
 */
export function WhoCanDoWhat({ currentRole }: { currentRole?: string }) {
  return (
    <Dialog>
      <DialogTrigger className="cursor-pointer text-foreground underline underline-offset-4 hover:text-primary">
        Who can do what
      </DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Who Can Do What</DialogTitle>
        </DialogHeader>
        <AccountTypeGuide currentRole={currentRole} className="lg:grid-cols-3" />
      </DialogContent>
    </Dialog>
  );
}
