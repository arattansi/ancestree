"use client";

import * as React from "react";
import { Heart, Share } from "lucide-react";

import { setPostLike } from "@/app/actions/library-likes";
import { copyText } from "@/components/copy-text";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/components/use-action";
import { UNREACHABLE } from "@/lib/action-feedback";
import {
  emailShareHref,
  facebookShareHref,
  hasMessagesApp,
  messagesHref,
  whatsappHref,
  xShareHref,
} from "@/lib/share-text";
import { cn } from "@/lib/utils";

/**
 * Under a published post, beside subscribing (Step 157): like it, and
 * share it. A like is the reader's, signed in or not, and shows at once;
 * the count is everyone's.
 */
export function PostEngagement({
  postId,
  url,
  title,
  likes,
}: {
  postId: string;
  /** The post's own address, in full. */
  url: string;
  title: string;
  likes: { likes: number; liked: boolean };
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <LikeButton postId={postId} initial={likes} />
      <ShareMenu url={url} title={title} />
    </div>
  );
}

function LikeButton({
  postId,
  initial,
}: {
  postId: string;
  initial: { likes: number; liked: boolean };
}) {
  const [state, setState] = React.useState(initial);
  const busy = React.useRef(false);

  async function toggle() {
    if (busy.current) return;
    busy.current = true;
    const before = state;
    const liked = !state.liked;
    setState({ liked, likes: Math.max(0, state.likes + (liked ? 1 : -1)) });
    try {
      const result = await setPostLike(postId, liked);
      if ("error" in result) {
        setState(before);
        toastError(result.error);
      } else {
        setState(result);
      }
    } catch {
      setState(before);
      toastError(UNREACHABLE);
    } finally {
      busy.current = false;
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      aria-pressed={state.liked}
      onClick={() => void toggle()}
    >
      <Heart
        data-icon="inline-start"
        aria-hidden
        className={cn(state.liked && "fill-brand-red text-brand-red")}
      />
      {state.liked ? "liked" : "like"}
      {state.likes ? (
        <span className="text-muted-foreground tabular-nums">
          {state.likes.toLocaleString("en")}
          <span className="sr-only">{state.likes === 1 ? " like" : " likes"}</span>
        </span>
      ) : null}
    </Button>
  );
}

function ShareMenu({ url, title }: { url: string; title: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}>
        <Share data-icon="inline-start" aria-hidden />
        share
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-auto min-w-40">
        <ShareItems url={url} title={title} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The menu's items, drawn only once it opens, so `navigator` is there. */
function ShareItems({ url, title }: { url: string; title: string }) {
  const messages = hasMessagesApp(navigator.userAgent);
  const sheet = typeof navigator.share === "function";
  const text = `${title}\n${url}`;
  const away = (href: string) => (
    <a href={href} target="_blank" rel="noopener noreferrer" />
  );
  return (
    <>
      <DropdownMenuItem
        onClick={() => void copyText(url, { copied: "Link copied" })}
      >
        Copy link
      </DropdownMenuItem>
      <DropdownMenuItem render={away(whatsappHref(text))}>WhatsApp</DropdownMenuItem>
      {messages ? (
        <DropdownMenuItem render={<a href={messagesHref(text)} />}>Messages</DropdownMenuItem>
      ) : null}
      <DropdownMenuItem render={<a href={emailShareHref(title, text)} />}>Email</DropdownMenuItem>
      <DropdownMenuItem render={away(facebookShareHref(url))}>Facebook</DropdownMenuItem>
      <DropdownMenuItem render={away(xShareHref(url, title))}>X</DropdownMenuItem>
      {sheet ? (
        <DropdownMenuItem
          // Closing the sheet without sharing rejects; that's no error.
          onClick={() => void navigator.share({ title, url }).catch(() => {})}
        >
          More…
        </DropdownMenuItem>
      ) : null}
    </>
  );
}
