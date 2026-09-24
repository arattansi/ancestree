"use client";

import * as React from "react";
import { useActionState } from "react";
import Link from "next/link";

import { askRelative, type AskRelativeState } from "@/app/actions/invite-relays";
import { requestInvite, type RequestInviteState } from "@/app/actions/invite-requests";
import {
  findFamilyTree,
  joinBetaWaitlist,
  type FindTreeState,
  type WaitlistState,
} from "@/app/actions/tree-requests";
import { InviteConsent, NameEmailFields } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { RELAY_NOTE, relayAnswer } from "@/lib/invite-relays";
import { REQUEST_ACCESS_INTRO } from "@/lib/request-forms";
import { waitlistReceived } from "@/lib/tree-requests";

const INITIAL_SEARCH: FindTreeState = {};
const INITIAL_REQUEST: RequestInviteState = {};
const INITIAL_WAITLIST: WaitlistState = {};
const INITIAL_ASK: AskRelativeState = {};

/** The home page's "request access" (Step 28): the flow, in a dialog. */
export function RequestAccessDialog({
  children,
  ...look
}: {
  children: React.ReactNode;
} & Pick<React.ComponentProps<typeof Button>, "size" | "variant" | "className">) {
  return (
    <Dialog>
      <DialogTrigger render={<Button {...look} />}>{children}</DialogTrigger>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Request access</DialogTitle>
          <DialogDescription>{REQUEST_ACCESS_INTRO}</DialogDescription>
        </DialogHeader>
        <RequestAccessFlow />
      </DialogContent>
    </Dialog>
  );
}

/**
 * Request access, for someone signed out (Step 28). They say who they are;
 * `findFamilyTree` looks for a tree showing someone by that name. Found, they
 * ask that tree's Roots for an invite — choosing which, when more than one
 * has them. Not found (or "not me"), they can ask a relative to invite them
 * directly, or join the waitlist to start a tree of their own.
 *
 * On /join, for someone signed in who isn't a member yet, `email` is the
 * address they've just verified (Step 30.8): it's filled in and fixed, so
 * they type only their name, and everything after asks with it.
 */
export function RequestAccessFlow({ email }: { email?: string }) {
  const [search, searchAction, searching] = useActionState(
    findFamilyTree,
    INITIAL_SEARCH,
  );
  // Going back is tied to the search it left, so a fresh search moves on.
  const [override, setOverride] = React.useState<{
    search: FindTreeState;
    show: "form" | "unmatched";
  } | null>(null);
  const show = override?.search === search ? override.show : null;

  if (search.found && show !== "form") {
    const backToForm = () => setOverride({ search, show: "form" });
    return search.found.length > 0 && show !== "unmatched" ? (
      <AskToJoin
        search={search}
        onNotMe={() => setOverride({ search, show: "unmatched" })}
      />
    ) : (
      <Unmatched search={search} onBack={backToForm} />
    );
  }

  return (
    <form action={searchAction} className="flex flex-col gap-4" noValidate>
      <NameEmailFields
        idPrefix="request-access"
        state={search}
        errorId={search.error ? "request-access-error" : undefined}
        email={email}
      />
      {search.error ? (
        <p id="request-access-error" role="alert" className="text-sm text-destructive">
          {search.error}
        </p>
      ) : null}
      <Button type="submit" disabled={searching}>
        {searching ? "Looking…" : "Find my family’s tree"}
      </Button>
      {/* Signed in already, on /join: signing in would come straight back. */}
      {email === undefined ? (
        <p className="text-sm text-muted-foreground">
          Already on ancestree?{" "}
          <Link href="/join" className="underline underline-offset-4">
            Sign in
          </Link>
        </p>
      ) : null}
    </form>
  );
}

/** Found: ask the tree's Roots for an invite, as the share link's form does. */
function AskToJoin({
  search,
  onNotMe,
}: {
  search: FindTreeState;
  onNotMe: () => void;
}) {
  const found = search.found ?? [];
  const [state, formAction, pending] = useActionState(requestInvite, INITIAL_REQUEST);
  const [consented, setConsented] = React.useState(false);
  const [slug, setSlug] = React.useState(found[0]?.slug ?? "");
  const chosen = found.find((t) => t.slug === slug) ?? found[0];
  const name = `${search.firstName ?? ""} ${search.lastName ?? ""}`.trim();

  if (state.ok) {
    return (
      <div role="status" className="rounded-lg border border-border bg-muted/40 p-4 text-sm">
        <p className="font-medium text-foreground">Request sent</p>
        <p className="mt-1 text-muted-foreground">
          Once a Root of {chosen.name} approves it, we&rsquo;ll email{" "}
          <span className="font-medium text-foreground">{state.email}</span> a
          link to the tree.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 text-sm">
      <input type="hidden" name="firstName" value={search.firstName ?? ""} />
      <input type="hidden" name="lastName" value={search.lastName ?? ""} />
      <input type="hidden" name="email" value={search.email ?? ""} />
      <input type="hidden" name="tree" value={chosen.slug} />

      {found.length === 1 ? (
        <div className="flex flex-col gap-1">
          <p className="font-medium text-foreground">
            We found someone named {name} on {chosen.name}
          </p>
          <p className="text-muted-foreground">If that&rsquo;s you, ask to join.</p>
        </div>
      ) : (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 font-medium text-foreground">
            We found someone named {name} on {found.length} trees
          </legend>
          <p className="text-muted-foreground">Choose which one to ask.</p>
          <RadioGroup
            value={slug}
            onValueChange={(v) => {
              if (typeof v === "string") setSlug(v);
            }}
          >
            {found.map((t) => (
              <label
                key={t.slug}
                className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 has-data-checked:border-ring"
              >
                <RadioGroupItem value={t.slug} />
                <span className="font-medium text-foreground">{t.name}</span>
              </label>
            ))}
          </RadioGroup>
        </fieldset>
      )}

      {state.error ? (
        <p role="alert" className="text-destructive">
          {state.error}
        </p>
      ) : null}

      <InviteConsent
        id="request-access-consent"
        checked={consented}
        onCheckedChange={setConsented}
      />

      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={pending || !consented}>
          {pending ? "Sending…" : "Request an invite"}
        </Button>
        <Button type="button" variant="ghost" onClick={onNotMe} disabled={pending}>
          That&rsquo;s not me
        </Button>
      </div>
    </form>
  );
}

/**
 * Not found: ask a relative who's on ancestree to invite them (Step 30.5),
 * or join the waitlist to start a tree of their own, with what they've
 * already typed.
 */
function Unmatched({
  search,
  onBack,
}: {
  search: FindTreeState;
  onBack: () => void;
}) {
  // Each ask starts a fresh form, so "Ask another relative" clears the last.
  const [asks, setAsks] = React.useState(0);

  return (
    <div className="flex flex-col gap-4 text-sm">
      <div className="flex flex-col gap-1">
        <p className="font-medium text-foreground">
          We couldn&rsquo;t find you on a tree yet
        </p>
        <p className="text-muted-foreground">
          You may not have been added yet, or you&rsquo;re under a different
          spelling.
        </p>
      </div>

      <AskRelative
        key={asks}
        search={search}
        onAskAnother={() => setAsks((n) => n + 1)}
      />

      <StartATree search={search} />

      <Button type="button" variant="ghost" className="self-start" onClick={onBack}>
        Try a different spelling
      </Button>
    </div>
  );
}

/**
 * Ask a relative who's on ancestree (Step 30.5): their address, and if it's
 * a member's, the newcomer's name and email are passed on with an invite
 * filled in for them to send. The answer is the same either way, so the
 * form never tells anyone who's a member.
 */
function AskRelative({
  search,
  onAskAnother,
}: {
  search: FindTreeState;
  onAskAnother: () => void;
}) {
  const [state, formAction, pending] = useActionState(askRelative, INITIAL_ASK);
  const errorId = state.error ? "request-access-relative-error" : undefined;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="font-medium text-foreground">
        Ask a relative who&rsquo;s on ancestree
      </p>
      {state.ok ? (
        <div role="status" className="flex flex-col gap-2">
          <p className="text-muted-foreground">{relayAnswer(search.email ?? "")}</p>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="self-start"
            onClick={onAskAnother}
          >
            Ask another relative
          </Button>
        </div>
      ) : (
        <form action={formAction} className="flex flex-col gap-2" noValidate>
          <input type="hidden" name="firstName" value={search.firstName ?? ""} />
          <input type="hidden" name="lastName" value={search.lastName ?? ""} />
          <input type="hidden" name="email" value={search.email ?? ""} />
          <p className="text-muted-foreground">{RELAY_NOTE}</p>
          <Label htmlFor="request-access-relative" className="mt-1">
            Your relative&rsquo;s email
          </Label>
          <Input
            key={state.relativeEmail ?? ""}
            id="request-access-relative"
            name="relativeEmail"
            type="email"
            autoComplete="off"
            inputMode="email"
            required
            defaultValue={state.relativeEmail ?? ""}
            placeholder="them@example.com"
            aria-invalid={state.error ? true : undefined}
            aria-describedby={errorId}
          />
          {state.error ? (
            <p id={errorId} role="alert" className="text-destructive">
              {state.error}
            </p>
          ) : null}
          <Button type="submit" size="sm" className="self-start" disabled={pending}>
            {pending ? "Sending…" : "Ask them to invite me"}
          </Button>
        </form>
      )}
    </div>
  );
}

/**
 * The waitlist, to start a tree of their own. A new tree starts from
 * scratch, so it says so before the button (Step 30.5), and it takes the
 * privacy agreement, as asking to join does (Step 30.6).
 */
function StartATree({ search }: { search: FindTreeState }) {
  const [state, formAction, pending] = useActionState(
    joinBetaWaitlist,
    INITIAL_WAITLIST,
  );
  const [consented, setConsented] = React.useState(false);

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
      <p className="font-medium text-foreground">Start a new tree</p>
      {state.ok && state.email ? (
        <p role="status" className="text-muted-foreground">
          {waitlistReceived(state.email)}
        </p>
      ) : (
        <form action={formAction} className="flex flex-col gap-3">
          <input type="hidden" name="firstName" value={search.firstName ?? ""} />
          <input type="hidden" name="lastName" value={search.lastName ?? ""} />
          <input type="hidden" name="email" value={search.email ?? ""} />
          <p className="text-muted-foreground">
            Join the beta waitlist and we&rsquo;ll email {search.email} when you
            can start a tree from scratch.
          </p>
          {state.error ? (
            <p role="alert" className="text-destructive">
              {state.error}
            </p>
          ) : null}
          <InviteConsent
            id="request-access-waitlist-consent"
            checked={consented}
            onCheckedChange={setConsented}
          />
          <Button
            type="submit"
            size="sm"
            className="self-start"
            disabled={pending || !consented}
          >
            {pending ? "Sending…" : "Join the beta waitlist"}
          </Button>
        </form>
      )}
    </div>
  );
}
