"use client";

import { MessageSquare, X } from "lucide-react";
import { usePathname } from "next/navigation";
import * as React from "react";

import { lazyComponent, whenIdle } from "@/components/lazy-component";
import {
  messenger,
  useMessenger,
} from "@/components/messenger/messenger-store";
import { Button } from "@/components/ui/button";
import {
  badgeCount,
  messagesLinkTarget,
  messengerShownOn,
  totalUnread,
  withoutMessagesLink,
} from "@/lib/messenger";

/** On the root element while the launcher shows, so toasts and the
 *  back-to-top button keep above it (globals.css). */
const MESSENGER_ATTR = "data-messenger";

// The pop-up itself, fetched when the launcher is pointed at, focused or
// pressed: a page carries only the button.
const MessengerPanel = lazyComponent(() =>
  import("@/components/messenger/messenger-panel").then(
    (m) => m.MessengerPanel,
  ),
);
function preloadPanel() {
  void MessengerPanel.preload().catch(() => {});
}

/**
 * The messenger (Step 174): direct messages with the family on your trees,
 * in a pop-up at the bottom right of the window. Here, the button that
 * opens it, with how many messages are unread; it wakes once the page is
 * idle (`messenger.start`) and only on a member's own pages
 * (`messengerShownOn`). Beside a person's details sheet it moves left of
 * it, as the toasts do.
 */
export function Messenger({ userId }: { userId: string }) {
  const pathname = usePathname();
  const shown = messengerShownOn(pathname);
  const open = useMessenger((s) => s.open);
  const unread = useMessenger((s) =>
    s.data ? totalUnread(s.data.conversations) : 0,
  );
  const launcherRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!shown) return;
    return whenIdle(() => messenger.start(userId));
  }, [shown, userId]);

  React.useLayoutEffect(() => {
    if (!shown) return;
    document.documentElement.setAttribute(MESSENGER_ATTR, "");
    return () => document.documentElement.removeAttribute(MESSENGER_ATTR);
  }, [shown]);

  // A link that asks for it (the newsletter's Unread Messages, Step 180)
  // opens the pop-up, on that conversation when it names someone; the
  // query then goes, so a reload doesn't open it again.
  React.useEffect(() => {
    if (!shown) return;
    const target = messagesLinkTarget(window.location.search);
    if (!target) return;
    const { pathname: path, search, hash } = window.location;
    window.history.replaceState(null, "", `${path}${withoutMessagesLink(search)}${hash}`);
    void messenger.openFromLink(userId, target.with);
  }, [shown, userId]);

  // Leaving for a page it doesn't sit on puts it away.
  React.useEffect(() => {
    if (!shown) messenger.close();
  }, [shown]);

  const close = React.useCallback(() => {
    messenger.close();
    launcherRef.current?.focus();
  }, []);

  if (!shown) return null;
  const label = unread > 0 ? `Messages, ${unread} unread` : "Messages";
  return (
    <>
      {open ? <MessengerPanel onClose={close} /> : null}
      <Button
        ref={launcherRef}
        type="button"
        size="icon"
        onClick={() => (open ? close() : messenger.open())}
        onPointerEnter={preloadPanel}
        onFocus={preloadPanel}
        aria-label={open ? "Close messages" : label}
        title={open ? "Close messages" : label}
        aria-expanded={open}
        className="messenger-launcher fixed bottom-4 z-40 size-11 rounded-lg shadow-lg sm:size-12"
      >
        {open ? (
          <X className="size-5" aria-hidden />
        ) : (
          <MessageSquare className="size-5" aria-hidden />
        )}
        {unread > 0 && !open ? (
          <span
            aria-hidden
            className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-semibold text-white tabular-nums ring-2 ring-background"
          >
            {badgeCount(unread)}
          </span>
        ) : null}
      </Button>
    </>
  );
}
