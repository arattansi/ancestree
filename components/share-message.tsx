"use client";

import * as React from "react";

import { copyText } from "@/components/copy-text";
import { Button } from "@/components/ui/button";
import { hasMessagesApp, messagesHref, whatsappHref } from "@/lib/share-text";
import { cn } from "@/lib/utils";

// Driven by a finger: a phone or a tablet, whose share sheet is how a
// message gets to a family chat (as `sendLink` reads it).
const TOUCH = "(pointer: coarse)";

type ShareDevice = { sheet: boolean; messages: boolean };

const NO_DEVICE: ShareDevice = { sheet: false, messages: false };
let device: ShareDevice | null = null;

// What this device can share to, read once on the client. The server's
// snapshot has neither, so WhatsApp leads until hydration says otherwise.
function readDevice(): ShareDevice {
  device ??= {
    sheet:
      typeof navigator.share === "function" && window.matchMedia(TOUCH).matches,
    messages: hasMessagesApp(navigator.userAgent),
  };
  return device;
}

const subscribe = () => () => {};

/** Whether this device has a share sheet (a phone's) and Messages. */
export function useShareDevice(): ShareDevice {
  return React.useSyncExternalStore(subscribe, readDevice, () => NO_DEVICE);
}

/** The share sheet with `message` in it: true once it went somewhere. */
export async function shareSheet(message: string): Promise<boolean> {
  try {
    await navigator.share({ text: message });
    return true;
  } catch {
    // Closed without sharing, or the sheet wouldn't open: copy is beside it.
    return false;
  }
}

/**
 * A message ready for a family chat, and the ways to send it (Step 212,
 * shared since Step 214): on a phone the share sheet leads (WhatsApp,
 * Messages, anything), then WhatsApp and copy; elsewhere WhatsApp does,
 * then Messages where an `sms:` link opens it (a Mac), and copy. Each
 * opens the chat with the message typed out, for them to pick who and
 * press send.
 */
export function ShareMessage({
  message,
  onShared,
  className,
}: {
  message: string;
  /** It went somewhere, as far as the page can tell. */
  onShared?: () => void;
  className?: string;
}) {
  const { sheet, messages } = useShareDevice();

  async function share() {
    if (await shareSheet(message)) onShared?.();
  }

  async function copy() {
    if (await copyText(message, { copied: "Message copied" })) onShared?.();
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <p
        // Anywhere, not break-words: a grid (a dialog) sizes its column to
        // the link's whole length otherwise.
        className="rounded-md bg-muted px-3 py-2 text-sm wrap-anywhere text-foreground"
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
    </div>
  );
}
