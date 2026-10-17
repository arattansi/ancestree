"use client";

import {
  ArrowLeft,
  LoaderCircle,
  SendHorizontal,
  SquarePen,
  X,
} from "lucide-react";
import * as React from "react";

import {
  messenger,
  useMessenger,
  type MessengerView,
} from "@/components/messenger/messenger-store";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  badgeCount,
  clockTime,
  dayLabel,
  filterContacts,
  initialsOf,
  MESSAGE_MAX,
  newDay,
  shortWhen,
  type ChatMessage,
  type ConversationSummary,
  type MessengerContact,
} from "@/lib/messenger";
import { cn } from "@/lib/utils";

/**
 * The messenger's pop-up (Step 174): your conversations, a new one with
 * anyone on a tree you're on, and a thread. Above its launcher at the
 * bottom right, left of a docked sheet; on a phone it takes the screen.
 * The page stays live behind it, so Escape or the launcher closes it.
 */
export function MessengerPanel({ onClose }: { onClose: () => void }) {
  const view = useMessenger((s) => s.view);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <section
      role="dialog"
      aria-label="Messages"
      className={cn(
        "messenger-panel fixed z-40 flex flex-col overflow-hidden bg-popover text-popover-foreground",
        "sm:bottom-[5.25rem] sm:h-[min(34rem,calc(100dvh-var(--site-header-height,3.5rem)-7rem))] sm:w-[22rem] sm:rounded-xl sm:border sm:shadow-xl",
        "max-sm:inset-0 max-sm:z-[60]",
      )}
    >
      {view.kind === "list" ? (
        <ListView onClose={onClose} />
      ) : view.kind === "new" ? (
        <NewView onClose={onClose} />
      ) : (
        <ThreadView key={view.id} id={view.id} onClose={onClose} />
      )}
    </section>
  );
}

function PanelHeader({
  title,
  back,
  onClose,
  children,
}: {
  title: React.ReactNode;
  back?: MessengerView;
  onClose: () => void;
  children?: React.ReactNode;
}) {
  return (
    <header className="flex min-h-14 shrink-0 items-center gap-1 border-b px-2">
      {back ? (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => messenger.show(back)}
          aria-label="Back"
          title="Back"
          className="relative tap-target"
        >
          <ArrowLeft aria-hidden />
        </Button>
      ) : null}
      <div className={cn("flex min-w-0 flex-1 items-center gap-2", !back && "pl-2")}>
        {title}
      </div>
      {children}
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        onClick={onClose}
        aria-label="Close messages"
        title="Close"
        className="relative tap-target"
      >
        <X aria-hidden />
      </Button>
    </header>
  );
}

function Face({
  name,
  photoUrl,
  photoCrop,
  className,
}: {
  name: string;
  photoUrl: string | null;
  photoCrop: unknown;
  className?: string;
}) {
  return (
    <Avatar className={cn("size-9 shrink-0 overflow-hidden", className)}>
      {photoUrl ? (
        <AvatarImage src={photoUrl} alt="" style={cropStyle(parseCrop(photoCrop))} />
      ) : null}
      <AvatarFallback className="text-xs font-medium">{initialsOf(name)}</AvatarFallback>
    </Avatar>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 p-3">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-12 w-full" />
      <span className="sr-only">Loading messages</span>
    </div>
  );
}

function LoadFailed({ onRetry }: { onRetry: () => void }) {
  return (
    <p className="p-4 text-sm text-muted-foreground">
      Couldn&rsquo;t load your messages.{" "}
      <button
        type="button"
        onClick={onRetry}
        className="font-medium text-foreground underline underline-offset-4"
      >
        Try again
      </button>
    </p>
  );
}

// ---------------------------------------------------------------------------
// Your conversations
// ---------------------------------------------------------------------------

function ListView({ onClose }: { onClose: () => void }) {
  const data = useMessenger((s) => s.data);
  const failed = useMessenger((s) => s.failed);
  const me = useMessenger((s) => s.me);

  return (
    <>
      <PanelHeader
        title={<h2 className="text-base font-semibold">Messages</h2>}
        onClose={onClose}
      >
        {data && data.contacts.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => messenger.show({ kind: "new" })}
            aria-label="New message"
            title="New message"
            className="relative tap-target"
          >
            <SquarePen aria-hidden />
          </Button>
        ) : null}
      </PanelHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!data ? (
          failed ? (
            <LoadFailed onRetry={() => void messenger.loadList()} />
          ) : (
            <ListSkeleton />
          )
        ) : data.conversations.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {data.contacts.length > 0
                ? "No messages yet."
                : "No one else is on your trees yet."}
            </p>
            {data.contacts.length > 0 ? (
              <Button
                type="button"
                size="sm"
                onClick={() => messenger.show({ kind: "new" })}
              >
                new message
              </Button>
            ) : null}
          </div>
        ) : (
          <ul className="flex flex-col py-1">
            {data.conversations.map((c) => (
              <li key={c.id}>
                <ConversationRow conversation={c} me={me} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ConversationRow({
  conversation: c,
  me,
}: {
  conversation: ConversationSummary;
  me: string | null;
}) {
  const unread = c.unread > 0;
  return (
    <button
      type="button"
      onClick={() => messenger.show({ kind: "thread", id: c.id })}
      className="flex w-full items-center gap-3 px-3 py-2.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
      aria-label={unread ? `${c.name}, ${c.unread} unread` : c.name}
    >
      <Face name={c.name} photoUrl={c.photoUrl} photoCrop={c.photoCrop} className="size-10" />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-baseline gap-2">
          <span className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
            {c.name}
          </span>
          {c.lastAt ? (
            <span className="ml-auto shrink-0 text-xs text-muted-foreground">
              {shortWhen(c.lastAt)}
            </span>
          ) : null}
        </span>
        <span className="flex items-center gap-2">
          <span
            className={cn(
              "truncate text-sm",
              unread ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {c.lastSenderId === me ? "You: " : ""}
            {c.lastBody}
          </span>
          {unread ? (
            <span className="ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-destructive px-1 text-[0.6875rem] font-semibold text-white tabular-nums">
              {badgeCount(c.unread)}
            </span>
          ) : null}
        </span>
      </span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// A new message: anyone on a tree you're on
// ---------------------------------------------------------------------------

function NewView({ onClose }: { onClose: () => void }) {
  const data = useMessenger((s) => s.data);
  const opening = useMessenger((s) => s.opening);
  const [query, setQuery] = React.useState("");
  const shown = data ? filterContacts(data.contacts, query) : [];

  return (
    <>
      <PanelHeader
        title={<h2 className="text-base font-semibold">New Message</h2>}
        back={{ kind: "list" }}
        onClose={onClose}
      />
      <div className="shrink-0 border-b p-3">
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or tree"
          aria-label="Search your family"
          autoFocus
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!data ? (
          <ListSkeleton />
        ) : data.contacts.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            No one else is on your trees yet.
          </p>
        ) : shown.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No one by that name.</p>
        ) : (
          <ul className="flex flex-col py-1">
            {shown.map((c) => (
              <li key={c.userId}>
                <ContactRow
                  contact={c}
                  busy={opening === c.userId}
                  disabled={!!opening}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function ContactRow({
  contact: c,
  busy,
  disabled,
}: {
  contact: MessengerContact;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={() => void messenger.openWith(c.userId)}
      disabled={disabled}
      aria-busy={busy}
      className="flex w-full items-center gap-3 px-3 py-2 text-left outline-none hover:bg-muted focus-visible:bg-muted disabled:opacity-60"
    >
      <Face name={c.name} photoUrl={c.photoUrl} photoCrop={c.photoCrop} />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{c.name}</span>
        <span className="truncate text-xs text-muted-foreground">
          {c.trees.join(" · ")}
        </span>
      </span>
      {busy ? (
        <LoaderCircle className="size-4 animate-spin text-muted-foreground" aria-hidden />
      ) : null}
    </button>
  );
}

// ---------------------------------------------------------------------------
// A thread
// ---------------------------------------------------------------------------

/** Who's on the other side: from the list, or the contact it was opened with. */
function usePeer(id: string): {
  name: string;
  photoUrl: string | null;
  photoCrop: unknown;
  canSend: boolean;
} | null {
  const summary = useMessenger((s) => s.data?.conversations.find((c) => c.id === id));
  const peerId = useMessenger((s) => s.peers[id]);
  const contact = useMessenger((s) =>
    peerId ? s.data?.contacts.find((c) => c.userId === peerId) : undefined,
  );
  if (summary) return summary;
  if (contact) return { ...contact, canSend: true };
  return null;
}

/** Messages from one person within five minutes sit close together. */
const RUN_MS = 5 * 60 * 1000;

function ThreadView({ id, onClose }: { id: string; onClose: () => void }) {
  const peer = usePeer(id);
  const thread = useMessenger((s) => s.threads[id]);
  const me = useMessenger((s) => s.me);
  const sendError = useMessenger((s) => s.sendError[id]);
  const messages = thread?.messages ?? [];
  const scroller = React.useRef<HTMLDivElement>(null);
  const atBottom = React.useRef(true);

  // Open at the newest; then follow new messages while the reader is at
  // the bottom (an older page read above keeps their place).
  const newest = messages.at(-1)?.id;
  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [newest, thread?.loading]);

  // Coming back to the tab reads what came while it was away.
  React.useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") messenger.markRead(id);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [id]);

  const name = peer?.name ?? "";
  return (
    <>
      <PanelHeader
        title={
          peer ? (
            <>
              <Face name={name} photoUrl={peer.photoUrl} photoCrop={peer.photoCrop} className="size-8" />
              <h2 className="truncate text-base font-semibold">{name}</h2>
            </>
          ) : (
            <Skeleton className="h-6 w-32" />
          )
        }
        back={{ kind: "list" }}
        onClose={onClose}
      />
      <div
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-2"
      >
        {thread?.more ? (
          <div className="flex justify-center py-1">
            <button
              type="button"
              onClick={() => {
                atBottom.current = false;
                messenger.loadOlder(id);
              }}
              disabled={thread.loading}
              className="text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Earlier messages
            </button>
          </div>
        ) : null}
        {!thread || (thread.loading && messages.length === 0) ? (
          <ListSkeleton />
        ) : thread.failed && messages.length === 0 ? (
          <LoadFailed onRetry={() => messenger.retryThread(id)} />
        ) : messages.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Say hello to {name.split(" ")[0] || "them"}.
          </p>
        ) : (
          <ol role="log" aria-live="polite" aria-label={`Messages with ${name}`} className="flex flex-col">
            {messages.map((m, i) => (
              <MessageItem key={m.id} message={m} previous={messages[i - 1]} mine={m.senderId === me} />
            ))}
          </ol>
        )}
      </div>
      {peer && !peer.canSend ? (
        <p className="shrink-0 border-t px-4 py-3 text-center text-sm text-muted-foreground">
          You no longer share a tree.
        </p>
      ) : (
        <Composer id={id} error={sendError} disabled={!peer} />
      )}
    </>
  );
}

function MessageItem({
  message: m,
  previous,
  mine,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  mine: boolean;
}) {
  const dayBreak = newDay(previous?.createdAt, m.createdAt);
  const run =
    !dayBreak &&
    previous?.senderId === m.senderId &&
    Date.parse(m.createdAt) - Date.parse(previous.createdAt) < RUN_MS;
  return (
    <li className={cn("flex flex-col", run ? "mt-0.5" : "mt-2.5")}>
      {dayBreak ? (
        <span className="my-2 self-center text-xs font-medium text-muted-foreground">
          {dayLabel(m.createdAt)}
        </span>
      ) : null}
      <span
        title={m.pending ? "Sending…" : clockTime(m.createdAt)}
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-1.5 text-sm break-words whitespace-pre-wrap",
          mine
            ? "self-end bg-primary text-primary-foreground"
            : "self-start bg-muted text-foreground",
          m.pending && "opacity-60",
        )}
      >
        {m.body}
      </span>
    </li>
  );
}

function Composer({
  id,
  error,
  disabled,
}: {
  id: string;
  error: string | undefined;
  disabled: boolean;
}) {
  const [text, setText] = React.useState("");
  const field = React.useRef<HTMLTextAreaElement>(null);

  // Grows with what's written, up to six lines or so.
  React.useLayoutEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  }, [text]);

  React.useEffect(() => {
    field.current?.focus();
  }, [id]);

  const submit = () => {
    if (!text.trim() || disabled) return;
    const body = text;
    setText("");
    void messenger.send(id, body).then((sent) => {
      // Not sent: the words come back to try again.
      if (!sent) setText((now) => now || body);
    });
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="shrink-0 border-t p-2"
    >
      {error ? (
        <p role="alert" className="px-1 pb-1.5 text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-end gap-2">
        <textarea
          ref={field}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          maxLength={MESSAGE_MAX}
          placeholder="Message"
          aria-label="Message"
          disabled={disabled}
          className="max-h-36 min-h-9 flex-1 resize-none rounded-2xl border border-input bg-transparent px-3 py-1.5 text-base outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <Button
          type="submit"
          size="icon"
          disabled={disabled || !text.trim()}
          aria-label="Send"
          title="Send"
          className="relative shrink-0 rounded-full tap-target"
        >
          <SendHorizontal aria-hidden />
        </Button>
      </div>
    </form>
  );
}
