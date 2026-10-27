"use client";

import * as React from "react";
import Link from "next/link";

import { rotateFamilyLink } from "@/app/actions/family-link";
import { copyText } from "@/components/copy-text";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAction } from "@/components/use-action";
import {
  FAMILY_LINK_MAX_USES,
  familyLinkCount,
  familyLinkMessage,
  isFamilyLinkFull,
} from "@/lib/family-link";
import type { FamilyLink } from "@/lib/family-link.server";
import { hasMessagesApp, messagesHref, whatsappHref } from "@/lib/share-text";
import { inviteHref } from "@/lib/sign-in-links";
import { adminHref } from "@/lib/tree-links";

// Driven by a finger: a phone or a tablet, whose share sheet is how a
// message gets to a family chat (as `sendLink` reads it).
const TOUCH = "(pointer: coarse)";

type Device = { sheet: boolean; messages: boolean };

const NO_DEVICE: Device = { sheet: false, messages: false };
let device: Device | null = null;

// What this device can share to, read once on the client. The server's
// snapshot has neither, so WhatsApp leads until hydration says otherwise.
function readDevice(): Device {
  device ??= {
    sheet:
      typeof navigator.share === "function" && window.matchMedia(TOUCH).matches,
    messages: hasMessagesApp(navigator.userAgent),
  };
  return device;
}

const subscribe = () => () => {};

/**
 * The founder's invite step opens on this (Step 212): the tree's family
 * link, made for them as the step loaded, and a message with it ready for
 * the family chat. On a phone the share sheet leads (WhatsApp, Messages,
 * anything), then WhatsApp and copy; elsewhere WhatsApp does, then
 * Messages where an `sms:` link opens it (a Mac), and copy. Each opens the chat with the message typed out, for
 * them to pick who and press send. A full link offers a new one; the Root
 * console keeps the rest (cap, rotate, turn off).
 */
export function FamilyLinkShare({
  treeId,
  treeName,
  link,
  baseUrl,
  onShared,
}: {
  treeId: string;
  treeName: string;
  link: FamilyLink;
  baseUrl: string;
  /** It went somewhere, as far as the page can tell. */
  onShared: () => void;
}) {
  const { sheet, messages } = React.useSyncExternalStore(
    subscribe,
    readDevice,
    () => NO_DEVICE,
  );
  const action = useAction();
  const message = familyLinkMessage(`${baseUrl}${inviteHref(link.token)}`, treeName);
  const full = isFamilyLinkFull(link);

  async function share() {
    try {
      await navigator.share({ text: message });
      onShared();
    } catch {
      // Closed without sharing, or the sheet wouldn't open: copy is beside it.
    }
  }

  async function copy() {
    if (await copyText(message, { copied: "Message copied" })) onShared();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Family Link</CardTitle>
        <CardDescription>
          One link for your family chat. Anyone with it can join, up to{" "}
          {link.maxUses}.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {full ? (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm text-muted-foreground">
              It&rsquo;s full: {familyLinkCount(link)}.
            </p>
            <PendingButton
              type="button"
              size="sm"
              pending={action.pendingKey === "rotate"}
              pendingLabel="making…"
              disabled={action.pending}
              onClick={() =>
                action.run("rotate", () => rotateFamilyLink(treeId, FAMILY_LINK_MAX_USES))
              }
            >
              new link
            </PendingButton>
          </div>
        ) : (
          <>
            <p
              className="rounded-md bg-muted px-3 py-2 text-sm break-words text-foreground"
              aria-label="Message"
            >
              {message}
            </p>
            <div className="flex flex-wrap gap-2">
              {sheet ? (
                <Button type="button" onClick={() => void share()}>
                  share
                </Button>
              ) : null}
              <Button
                variant={sheet ? "outline" : "default"}
                nativeButton={false}
                render={
                  <a
                    href={whatsappHref(message)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={onShared}
                  />
                }
              >
                WhatsApp
              </Button>
              {/* A phone's sheet has Messages in it already. */}
              {messages && !sheet ? (
                <Button
                  variant="outline"
                  nativeButton={false}
                  render={<a href={messagesHref(message)} onClick={onShared} />}
                >
                  Messages
                </Button>
              ) : null}
              <Button type="button" variant="outline" onClick={() => void copy()}>
                copy
              </Button>
            </div>
          </>
        )}
        <p className="text-xs text-muted-foreground">
          {link.useCount > 0 && !full ? `${familyLinkCount(link)} · ` : null}
          <Link href={adminHref("family-link")} className="underline underline-offset-4">
            Manage link
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
