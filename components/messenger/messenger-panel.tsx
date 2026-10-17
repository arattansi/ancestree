"use client";

import {
  ArrowLeft,
  Check,
  Copy,
  LoaderCircle,
  LockKeyhole,
  SendHorizontal,
  ShieldCheck,
  SquarePen,
  X,
} from "lucide-react";
import { encode as encodeQr } from "uqr";
import * as React from "react";

import { sendClaimInvite } from "@/app/actions/invites";
import {
  messenger,
  useMessenger,
  type InviteTarget,
  type MessengerView,
} from "@/components/messenger/messenger-store";
import { copyText } from "@/components/copy-text";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { describeClaimInvite } from "@/lib/claim-invites";
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
  unreadText,
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
  const keys = useMessenger((s) => s.keys);

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
      {view.kind === "invite" ? (
        <InviteView key={view.target.personId} target={view.target} onClose={onClose} />
      ) : keys === "locked" ? (
        // Their key lives on another device (Step 174.6).
        <LockedView onClose={onClose} />
      ) : keys === "unavailable" ? (
        <UnavailableView onClose={onClose} />
      ) : view.kind === "security" ? (
        <SecurityView onClose={onClose} />
      ) : view.kind === "verify" ? (
        <VerifyView key={view.id} id={view.id} onClose={onClose} />
      ) : view.kind === "list" ? (
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
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => messenger.show({ kind: "security" })}
          aria-label="Message security"
          title="Message security"
          className="relative tap-target"
        >
          <LockKeyhole aria-hidden />
        </Button>
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
            {c.lastStatus ? (
              <span className="italic">{unreadText(c.lastStatus)}</span>
            ) : (
              c.lastBody
            )}
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
  userId: string | null;
  name: string;
  photoUrl: string | null;
  photoCrop: unknown;
  canSend: boolean;
  /** Null until they next open the messenger: nothing can be sealed to them. */
  keyVersion: number | null;
} | null {
  const summary = useMessenger((s) => s.data?.conversations.find((c) => c.id === id));
  const peerId = useMessenger((s) => s.peers[id]);
  const contact = useMessenger((s) =>
    peerId ? s.data?.contacts.find((c) => c.userId === peerId) : undefined,
  );
  if (summary)
    return { ...summary, userId: summary.otherUserId, keyVersion: summary.otherKeyVersion };
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
  const first = name.split(" ")[0] || "They";
  const verifiedKey = useMessenger((s) =>
    peer?.userId ? s.verified[peer.userId] : undefined,
  );
  const currentKey = useMessenger((s) =>
    peer?.userId ? s.keyIds[peer.userId] : undefined,
  );
  // Checked before, and their key has changed since (Step 174.6): nothing
  // more goes to them until it's checked again.
  const codeChanged = !!verifiedKey && !!currentKey && verifiedKey !== currentKey;
  return (
    <>
      <PanelHeader
        title={
          peer ? (
            <>
              <Face name={name} photoUrl={peer.photoUrl} photoCrop={peer.photoCrop} className="size-8" />
              <h2 className="truncate text-base font-semibold">{name}</h2>
              {verifiedKey && !codeChanged ? (
                <ShieldCheck className="size-4 shrink-0 text-muted-foreground" aria-label="Verified" />
              ) : null}
            </>
          ) : (
            <Skeleton className="h-6 w-32" />
          )
        }
        back={{ kind: "list" }}
        onClose={onClose}
      >
        {peer?.keyVersion != null ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => messenger.show({ kind: "verify", id })}
            aria-label={`Verify ${name}`}
            title={`Verify ${name}`}
            className="relative tap-target"
          >
            <LockKeyhole aria-hidden />
          </Button>
        ) : null}
      </PanelHeader>
      {codeChanged ? (
        <p className="shrink-0 border-b bg-attention/20 px-4 py-2 text-xs">
          {first}&rsquo;s security code changed.{" "}
          <button
            type="button"
            onClick={() => messenger.show({ kind: "verify", id })}
            className="font-medium underline underline-offset-4"
          >
            Verify again
          </button>
        </p>
      ) : null}
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
              <MessageItem
                key={m.id}
                message={m}
                previous={messages[i - 1]}
                lastFromThem={lastFrom(messages, i, m.senderId)}
                mine={m.senderId === me}
                name={first}
              />
            ))}
          </ol>
        )}
      </div>
      {peer && !peer.canSend ? (
        <p className="shrink-0 border-t px-4 py-3 text-center text-sm text-muted-foreground">
          You no longer share a tree.
        </p>
      ) : peer && peer.keyVersion == null ? (
        <p className="shrink-0 border-t px-4 py-3 text-center text-sm text-muted-foreground">
          {first} can get messages once they next visit ancestree.
        </p>
      ) : codeChanged ? (
        <p className="shrink-0 border-t px-4 py-3 text-center text-sm text-muted-foreground">
          Verify {first}&rsquo;s new security code to keep writing.
        </p>
      ) : (
        <Composer id={id} error={sendError} disabled={!peer} />
      )}
    </>
  );
}

/** The message before `index` from the same sender, if any. */
function lastFrom(
  messages: readonly ChatMessage[],
  index: number,
  senderId: string,
): ChatMessage | undefined {
  for (let i = index - 1; i >= 0; i--) {
    if (messages[i].senderId === senderId) return messages[i];
  }
  return undefined;
}

function MessageItem({
  message: m,
  previous,
  lastFromThem,
  mine,
  name,
}: {
  message: ChatMessage;
  previous: ChatMessage | undefined;
  /** Their message before this one, to tell when their key changed. */
  lastFromThem: ChatMessage | undefined;
  mine: boolean;
  name: string;
}) {
  const dayBreak = newDay(previous?.createdAt, m.createdAt);
  const keyChanged =
    !mine &&
    !!lastFromThem &&
    lastFromThem.senderKeyVersion !== m.senderKeyVersion;
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
      {keyChanged ? (
        <span className="my-2 self-center text-xs text-muted-foreground">
          {name}&rsquo;s security code changed.
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
          m.status && "italic opacity-70",
        )}
      >
        {m.status ? unreadText(m.status) : m.body}
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

// ---------------------------------------------------------------------------
// Someone not on ancestree yet: invite them (Step 174.5)
// ---------------------------------------------------------------------------

/**
 * A message to an entry nobody is behind yet can't go anywhere, so the
 * window asks for their email instead and sends the same invite to claim
 * the entry as the sheet does (`sendClaimInvite`, by its rules). Once
 * they've joined and claimed it, **message** opens a conversation.
 */
function InviteView({
  target,
  onClose,
}: {
  target: InviteTarget;
  onClose: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [sentTo, setSentTo] = React.useState<string | null>(null);
  const action = useAction({ inline: true });
  const who = target.firstName || target.name;
  const live = target.invites.filter((i) => i.live);

  function send(e: React.FormEvent) {
    e.preventDefault();
    action.run("send", () => sendClaimInvite(target.personId, email, target.treeId), {
      onSuccess: (res) => {
        setSentTo(res.email ?? email.trim());
        setEmail("");
      },
    });
  }

  return (
    <>
      <PanelHeader
        title={
          <>
            <Face
              name={target.name}
              photoUrl={target.photoUrl}
              photoCrop={target.photoCrop}
              className="size-8"
            />
            <h2 className="truncate text-base font-semibold">{target.name}</h2>
          </>
        }
        back={{ kind: "list" }}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
        <p className="text-sm font-medium">{who} isn&rsquo;t on ancestree yet.</p>
        {sentTo ? (
          <p role="status" className="text-sm text-muted-foreground">
            Invite sent to {sentTo}. You can message {who} once they join.
          </p>
        ) : (
          <>
            {live.length > 0 ? (
              <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
                {live.map((invite) => (
                  <li key={invite.id}>{describeClaimInvite(invite)}</li>
                ))}
              </ul>
            ) : null}
            {target.canInvite ? (
              <form onSubmit={send} className="flex w-full flex-col gap-2 text-left">
                <label htmlFor="messenger-invite-email" className="text-sm text-muted-foreground">
                  Invite {who} by email to message them.
                </label>
                <Input
                  id="messenger-invite-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="them@example.com"
                  autoComplete="off"
                  autoFocus
                />
                <PendingButton
                  type="submit"
                  pending={action.pendingKey === "send"}
                  pendingLabel="sending…"
                  disabled={action.pending}
                >
                  {live.length > 0 ? "send another invite" : "send invite"}
                </PendingButton>
                {action.error ? (
                  <p role="alert" className="text-sm text-destructive">
                    {action.error}
                  </p>
                ) : null}
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {target.treeName
                  ? `Ask whoever runs ${target.treeName} to invite them.`
                  : "Ask a Root to invite them."}
              </p>
            )}
          </>
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Keys on this device (Step 174.6)
// ---------------------------------------------------------------------------

function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 overflow-y-auto px-6 py-8 text-center">
      {children}
    </div>
  );
}

/**
 * This member's key lives on another device, or changed there: link this
 * one from it, open it with the recovery phrase, or start over.
 */
function LockedView({ onClose }: { onClose: () => void }) {
  const backup = useMessenger((s) => s.backupVersion != null && s.backupVersion === s.keyVersion);
  const [mode, setMode] = React.useState<"choose" | "phrase" | "start-over">("choose");
  const [phrase, setPhrase] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  async function run(task: () => Promise<string | null>) {
    setBusy(true);
    setError(null);
    const problem = await task();
    setBusy(false);
    if (problem) setError(problem);
  }

  return (
    <>
      <PanelHeader
        title={<h2 className="text-base font-semibold">Messages</h2>}
        onClose={onClose}
      />
      <Notice>
        <LockKeyhole className="size-6 text-muted-foreground" aria-hidden />
        <p className="text-sm font-medium">Your messages are locked on this device.</p>
        {mode === "choose" ? (
          <>
            <p className="text-sm text-muted-foreground">
              On a device you&rsquo;ve used before, open messages, choose the lock, then
              link a device.
            </p>
            {backup ? (
              <Button type="button" variant="outline" onClick={() => setMode("phrase")}>
                use recovery phrase
              </Button>
            ) : null}
            <button
              type="button"
              onClick={() => setMode("start-over")}
              className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
            >
              Lost every device? Start over
            </button>
          </>
        ) : mode === "phrase" ? (
          <form
            className="flex w-full flex-col gap-2 text-left"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => messenger.useRecoveryPhrase(phrase));
            }}
          >
            <label htmlFor="messenger-phrase" className="text-sm text-muted-foreground">
              Your 12 words
            </label>
            <textarea
              id="messenger-phrase"
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
              rows={3}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              className="resize-none rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
            />
            <PendingButton type="submit" pending={busy} pendingLabel="unlocking…" disabled={busy}>
              unlock
            </PendingButton>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
              back
            </Button>
          </form>
        ) : (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">
              Start over? Earlier messages can&rsquo;t be read here, and your family will
              see your security code changed.
            </p>
            <PendingButton
              type="button"
              variant="destructive"
              pending={busy}
              pendingLabel="starting over…"
              disabled={busy}
              onClick={() => void run(messenger.startOver)}
            >
              start over
            </PendingButton>
            <Button type="button" variant="ghost" onClick={() => setMode("choose")}>
              cancel
            </Button>
          </div>
        )}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </Notice>
    </>
  );
}

function UnavailableView({ onClose }: { onClose: () => void }) {
  return (
    <>
      <PanelHeader
        title={<h2 className="text-base font-semibold">Messages</h2>}
        onClose={onClose}
      />
      <Notice>
        <p className="text-sm text-muted-foreground">
          This browser can&rsquo;t keep your messages private. Try another browser, or a
          window that isn&rsquo;t private.
        </p>
      </Notice>
    </>
  );
}

/** A QR code, drawn as one path. */
function QrCode({ text, label }: { text: string; label: string }) {
  const { size, data } = React.useMemo(() => encodeQr(text, { ecc: "M", border: 2 }), [text]);
  const d = data
    .flatMap((row, y) => row.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : "")))
    .join("");
  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={label}
      className="size-48 rounded-md bg-white"
      shapeRendering="crispEdges"
    >
      <path d={d} fill="#000" />
    </svg>
  );
}

/** Linking another device, and the recovery phrase. */
function SecurityView({ onClose }: { onClose: () => void }) {
  const backup = useMessenger((s) => s.backupVersion != null && s.backupVersion === s.keyVersion);
  const [link, setLink] = React.useState<string | null>(null);
  const [phrase, setPhrase] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"link" | "phrase" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function makeLink() {
    setBusy("link");
    setError(null);
    const made = await messenger.makeDeviceLink();
    setBusy(null);
    if (made) setLink(made);
    else setError("Couldn't make a link. Try again.");
  }

  async function makePhrase() {
    setBusy("phrase");
    setError(null);
    const made = await messenger.makeRecoveryPhrase();
    setBusy(null);
    if (made) setPhrase(made);
    else setError("Couldn't set a recovery phrase. Try again.");
  }

  return (
    <>
      <PanelHeader
        title={<h2 className="text-base font-semibold">Message Security</h2>}
        back={{ kind: "list" }}
        onClose={onClose}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-4 text-sm">
        <p className="text-muted-foreground">
          Your messages are locked to your devices. Ancestree can&rsquo;t read them.
        </p>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Link a Device</h3>
          {link ? (
            <div className="flex flex-col items-center gap-3 text-center">
              <QrCode text={link} label="Code to link a device" />
              <p className="text-muted-foreground">
                Scan with your other device&rsquo;s camera, or open the link there. It
                works once, for 10 minutes.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void copyText(link, { copied: "Link copied" })}
              >
                <Copy aria-hidden />
                copy link
              </Button>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">Read your messages on another device too.</p>
              <PendingButton
                type="button"
                variant="outline"
                className="self-start"
                pending={busy === "link"}
                pendingLabel="making…"
                disabled={!!busy}
                onClick={() => void makeLink()}
              >
                link a device
              </PendingButton>
            </>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="font-medium">Recovery Phrase</h3>
          {phrase ? (
            <div className="flex flex-col gap-3">
              <ol className="grid grid-cols-3 gap-x-3 gap-y-1.5 rounded-lg border p-3 font-mono text-xs">
                {phrase.split(" ").map((word, i) => (
                  <li key={i}>
                    <span className="text-muted-foreground">{i + 1}.</span> {word}
                  </li>
                ))}
              </ol>
              <p className="text-muted-foreground">
                Write these down and keep them safe. Anyone with them can read your
                messages.
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void copyText(phrase, { copied: "Copied" })}
                >
                  <Copy aria-hidden />
                  copy
                </Button>
                <Button type="button" size="sm" onClick={() => setPhrase(null)}>
                  <Check aria-hidden />
                  done
                </Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-muted-foreground">
                {backup
                  ? "Set. A new phrase replaces it."
                  : "Lose every device and 12 words still unlock your messages."}
              </p>
              <PendingButton
                type="button"
                variant="outline"
                className="self-start"
                pending={busy === "phrase"}
                pendingLabel="making…"
                disabled={!!busy}
                onClick={() => void makePhrase()}
              >
                {backup ? "make a new phrase" : "set a recovery phrase"}
              </PendingButton>
            </>
          )}
        </section>

        {error ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : null}
      </div>
    </>
  );
}

/** A conversation's safety code, to compare with the other member. */
function VerifyView({ id, onClose }: { id: string; onClose: () => void }) {
  const peer = usePeer(id);
  const otherId = peer?.userId ?? null;
  const verified = useMessenger((s) => (otherId ? s.verified[otherId] : undefined));
  const [code, setCode] = React.useState<{ code: string[]; key: string } | null | "none">(null);

  React.useEffect(() => {
    if (!otherId) return;
    let live = true;
    void messenger.codeFor(otherId).then((c) => {
      if (live) setCode(c ?? "none");
    });
    return () => {
      live = false;
    };
  }, [otherId]);

  const name = peer?.name ?? "";
  const first = name.split(" ")[0] || "them";
  const isVerified = code && code !== "none" && verified === code.key;
  return (
    <>
      <PanelHeader
        title={<h2 className="truncate text-base font-semibold">Verify {name}</h2>}
        back={{ kind: "thread", id }}
        onClose={onClose}
      />
      <Notice>
        {code === null ? (
          <Skeleton className="h-24 w-56" />
        ) : code === "none" ? (
          <p className="text-sm text-muted-foreground">
            {first} can get messages once they next visit ancestree.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Compare these numbers with {first}, in person or on a call. If they match,
              your messages reach only {first}.
            </p>
            <ol
              aria-label="Safety code"
              className="grid grid-cols-4 gap-x-4 gap-y-2 font-mono text-base tabular-nums"
            >
              {code.code.map((group, i) => (
                <li key={i}>{group}</li>
              ))}
            </ol>
            {isVerified ? (
              <div className="flex flex-col items-center gap-1">
                <p className="flex items-center gap-1.5 text-sm font-medium">
                  <ShieldCheck className="size-4" aria-hidden />
                  Verified
                </p>
                <button
                  type="button"
                  onClick={() => otherId && void messenger.setVerified(otherId, null)}
                  className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                >
                  Clear
                </button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => otherId && void messenger.setVerified(otherId, code.key)}
              >
                <ShieldCheck aria-hidden />
                they match
              </Button>
            )}
          </>
        )}
      </Notice>
    </>
  );
}
