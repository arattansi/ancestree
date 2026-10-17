"use client";

import { MessageSquare } from "lucide-react";
import * as React from "react";
import { createPortal } from "react-dom";

import { lazyComponent, whenIdle } from "@/components/lazy-component";
import {
  messenger,
  useMessenger,
} from "@/components/messenger/messenger-store";
import { NavCount } from "@/components/site-nav-link";
import { Button } from "@/components/ui/button";
import {
  badgeCount,
  messagesLinkTarget,
  totalUnread,
  withoutMessagesLink,
} from "@/lib/messenger";

// The pop-up itself, fetched when the button is pointed at, focused or
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
 * The messenger (Step 174): direct messages with the family on your trees.
 * Here, its button in the header between **account** and the bell (Step
 * 181), drawn as the bell is, with how many messages are unread; it wakes
 * once the page is idle (`messenger.start`). The pop-up drops from under
 * the header's right end, left of a docked sheet (globals.css), and takes
 * the screen on a phone. It's rendered on the page's body, not in the
 * header: the header's frosted glass would hold a fixed pop-up inside it.
 */
export function Messenger({ userId }: { userId: string }) {
  const open = useMessenger((s) => s.open);
  const unread = useMessenger((s) =>
    s.data ? totalUnread(s.data.conversations) : 0,
  );
  const buttonRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => whenIdle(() => messenger.start(userId)), [userId]);

  // A link that asks for it (the newsletter's Unread Messages, Step 180)
  // opens the pop-up, on that conversation when it names someone; the
  // query then goes, so a reload doesn't open it again.
  React.useEffect(() => {
    const target = messagesLinkTarget(window.location.search);
    if (!target) return;
    const { pathname: path, search, hash } = window.location;
    window.history.replaceState(null, "", `${path}${withoutMessagesLink(search)}${hash}`);
    void messenger.openFromLink(userId, target.with);
  }, [userId]);

  const close = React.useCallback(() => {
    messenger.close();
    buttonRef.current?.focus();
  }, []);

  return (
    <>
      <Button
        ref={buttonRef}
        size="sm"
        variant="ghost"
        className="relative tap-target"
        onClick={() => (open ? close() : messenger.open())}
        onPointerEnter={preloadPanel}
        onFocus={preloadPanel}
        aria-expanded={open}
        aria-label={unread > 0 ? `Messages, ${unread} unread` : "Messages"}
      >
        <MessageSquare className="size-4" aria-hidden />
        {unread > 0 ? (
          <NavCount variant="destructive">{badgeCount(unread)}</NavCount>
        ) : null}
      </Button>
      {open ? createPortal(<MessengerPanel onClose={close} />, document.body) : null}
    </>
  );
}
