"use client";

import * as React from "react";

import { makeSignInLink } from "@/app/actions/members";
import { copyText } from "@/components/copy-text";
import { PendingButton } from "@/components/pending-button";
import { QrCode } from "@/components/qr-code";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAction } from "@/components/use-action";

/**
 * The Root console's button beside a member with no email (Step 202.3): a
 * sign-in link to send them, in WeChat or any other way, or to scan from
 * this screen. WeChat can't be opened with a message ready, as WhatsApp
 * can, so it's a QR code and Copy.
 */
export function SignInLinkButton({
  treeId,
  userId,
  name,
}: {
  treeId: string;
  userId: string;
  name: string;
}) {
  const action = useAction();
  const [url, setUrl] = React.useState<string | null>(null);

  function make() {
    action.run("make", () => makeSignInLink(treeId, userId), {
      onSuccess: (res) => {
        if (res.url) setUrl(res.url);
      },
    });
  }

  return (
    <>
      <PendingButton
        type="button"
        variant="outline"
        size="sm"
        pending={action.pending}
        pendingLabel="making…"
        onClick={make}
      >
        sign-in link
      </PendingButton>
      <Dialog open={url !== null} onOpenChange={(open) => !open && setUrl(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign-in link for {name}</DialogTitle>
            <DialogDescription>Works once, for 24 hours.</DialogDescription>
          </DialogHeader>
          {url ? (
            <div className="flex flex-col items-center gap-4">
              <QrCode text={url} label={`Sign-in link for ${name}`} />
              <div className="flex w-full gap-2">
                <Input
                  readOnly
                  value={url}
                  aria-label={`Sign-in link for ${name}`}
                  className="font-mono text-xs"
                  onFocus={(e) => e.currentTarget.select()}
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void copyText(url, { copied: "Link copied" })}
                >
                  copy
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
