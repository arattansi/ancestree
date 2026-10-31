"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CheckIcon, ImagePlusIcon, XIcon } from "lucide-react";

import { CardLeaf } from "@/components/birthday-card/card-leaf";
import { CardOpening } from "@/components/birthday-card/card-opening";
import { CardPage, type SignerOf } from "@/components/birthday-card/card-pages";
import { InkField } from "@/components/birthday-card/ink-pad";
import { VoiceRecorder, type VoiceTake } from "@/components/birthday-card/voice-recorder";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { InviteConsent } from "@/components/request-fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import {
  CARD_MESSAGE_MAX,
  CARD_PHOTO_EDGE,
  cardDay,
  possessive,
  type BirthdayCardView,
} from "@/lib/birthday-cards";
import { draftOf, inkOf, type InkDraft } from "@/lib/card-ink";
import { joinLine, pronounOf, relationWords } from "@/lib/card-links";
import type { CardLinkPage } from "@/lib/card-links.server";
import {
  CARD_FAMILY_RELATIONS,
  relationLabel,
  type CardFamilyRelation,
  type CardRelation,
} from "@/lib/card-relations";
import { uploadCardFileByLink } from "@/lib/card-upload";
import { cn } from "@/lib/utils";

type LivePage = Extract<CardLinkPage, { state: "live" }>;

type Photo = { kind: "new"; file: File; url: string } | { kind: "kept"; path: string; url: string | null };

/** "she’ll", "he’ll", "they’ll". */
function theyWill(sex: string | null): string {
  return sex === "female" ? "she’ll" : sex === "male" ? "he’ll" : "they’ll";
}

/** A route under /api/cards, answered `{ error }` or not. */
async function post(path: string, body: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    const res = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const answer = (await res.json().catch(() => ({}))) as { error?: string };
    return res.ok ? {} : { error: answer.error ?? "Something went wrong. Try again." };
  } catch {
    return { error: "Couldn’t reach ancestree. Check your connection and try again." };
  }
}

/** Seen once a page: the link's page drawn, its join button shown. */
const seen = new Set<string>();
function noteSeen(token: string, what: "opened" | "join_shown") {
  const key = `${what}:${token}`;
  if (seen.has(key)) return;
  seen.add(key);
  void fetch("/api/cards/opened", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, what }),
    keepalive: true,
  }).catch(() => {});
}

/**
 * A birthday card's link, as whoever holds it sees it (Step 217.3): the
 * person's first name, the day, their leaf, who's collecting. Before
 * signing, the form: their name (signed out), how they know the person
 * (on the public link), a message, a voice memo, a photo. Once signed: their
 * signature to change or take off, everyone's so far, and, if they're
 * family who'd pass the gate, Ask to join; a personal link's relative claims
 * their entry. After the day, the browser that signed opens the card.
 */
export function CardLinkSigning({ page }: { page: LivePage }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [opening, setOpening] = React.useState(false);
  const first = page.firstName;
  const pronoun = pronounOf(page.sex);

  React.useEffect(() => noteSeen(page.token, "opened"), [page.token]);

  const signer = React.useCallback<SignerOf>(
    (s) => ({ leaf: null, relation: s.mine ? "you" : relationWords(s.relation, pronoun) }),
    [pronoun],
  );
  const signatures = page.signatures ?? [];
  const done = () => {
    setEditing(false);
    router.refresh();
  };

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-col items-center gap-3 text-center">
        {page.photo ? (
          <div className="relative">
            <span className="block size-24 overflow-hidden rounded-full border border-kraft-line/40 bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element -- a signed link to a private bucket */}
              <img src={page.photo.url} alt="" className="size-full object-cover" style={page.photo.style} />
            </span>
            <CardLeaf shape={page.leaf} className="absolute -right-8 -bottom-1" />
          </div>
        ) : (
          <CardLeaf shape={page.leaf} className="h-[70px] w-[120px]" />
        )}
        <h1 className="text-2xl font-bold tracking-tight">
          {possessive(first)} birthday is on {cardDay(page.opensOn)}.
        </h1>
        {page.closed ? null : (
          <p className="text-[15px] text-muted-foreground">
            {page.collector} is collecting messages. {theyWill(page.sex)} see them on the day.
          </p>
        )}
      </header>

      {page.mine && !editing ? (
        <div className="flex flex-col gap-6">
          {page.closed ? (
            <p className="text-center text-[15px] text-muted-foreground">the card is closed.</p>
          ) : page.isOpen ? (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-kraft-line/40 bg-cake-sponge p-4">
              <div className="flex flex-col">
                <h2 className="text-[15px] font-bold">{possessive(first)} birthday card</h2>
                <p className="text-[13px] text-muted-foreground">it opened on {cardDay(page.opensOn)}.</p>
              </div>
              <Button onClick={() => setOpening(true)}>open the card</Button>
              {page.thanks ? (
                <figure className="flex flex-col gap-1 self-stretch border-t border-kraft-line/40 pt-3">
                  <blockquote className="text-[15px] whitespace-pre-line">“{page.thanks}”</blockquote>
                  <figcaption className="text-[13px] text-muted-foreground">{possessive(first)} thank-you</figcaption>
                </figure>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-brand-green text-white"
              >
                <CheckIcon className="size-4" />
              </span>
              <div className="flex flex-col gap-1">
                <h2 className="text-lg font-bold">
                  signed. {first} will see it on {cardDay(page.opensOn)}.
                </h2>
                {page.signing ? (
                  <Button
                    variant="link"
                    className="h-auto self-start p-0 text-[15px]"
                    onClick={() => setEditing(true)}
                  >
                    change your signature
                  </Button>
                ) : null}
              </div>
            </div>
          )}

          {page.claimUrl ? <ClaimEntry first={first} url={page.claimUrl} /> : null}
          {page.joinable ? <JoinTree page={page} /> : null}

          {!page.isOpen && !page.closed ? (
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[15px] font-semibold">
                signed so far <span className="font-normal text-muted-foreground">{signatures.length}</span>
              </h2>
              <ul className="flex flex-col gap-2">
                {signatures.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      "max-h-96 overflow-y-auto rounded-lg border bg-cake-sponge [&_article]:p-3 [&_p]:text-[15px]",
                      s.mine ? "border-foreground" : "border-kraft-line/30",
                    )}
                  >
                    <CardPage signature={s} signer={signer} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Theirs to take off whenever, the link off or the day gone. */}
          <ConfirmButton
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            confirm={{
              title: "Take your signature off?",
              description: "Your message, voice memo, photo and drawing go with it.",
              confirmLabel: "take it off",
              pendingLabel: "taking it off…",
              destructive: true,
              onConfirm: () => post("/api/cards/delete", { token: page.token, signatureId: page.mine?.id }),
              onSuccess: () => router.refresh(),
            }}
          >
            take your signature off
          </ConfirmButton>
        </div>
      ) : page.signing ? (
        <SignForm page={page} onDone={done} onCancel={page.mine ? () => setEditing(false) : undefined} />
      ) : (
        <p className="text-center text-[15px] text-muted-foreground">signing has closed.</p>
      )}

      {opening && page.isOpen && !page.closed ? (
        <CardOpening
          card={openedCard(page)}
          firstName={first}
          leaf={page.leaf}
          signer={signer}
          open
          onOpenChange={(open) => {
            if (!open) setOpening(false);
          }}
        />
      ) : null}
    </div>
  );
}

/** The opened card, as the card's own opening draws it for a signer. */
function openedCard(page: LivePage): BirthdayCardView {
  return {
    id: page.token,
    personId: "",
    year: Number(page.opensOn.slice(0, 4)),
    opensOn: page.opensOn,
    opensAt: "",
    closesAt: "",
    isOpen: true,
    signing: false,
    closed: false,
    startedBy: page.collector,
    openedAt: null,
    recipient: false,
    manager: false,
    signed: true,
    thanks: page.thanks,
    thankedAt: null,
    unthanked: 0,
    link: null,
    signatures: page.signatures ?? [],
  };
}

function SignForm({
  page,
  onDone,
  onCancel,
}: {
  page: LivePage;
  onDone: () => void;
  onCancel?: () => void;
}) {
  const mine = page.mine;
  const sign = useAction({ inline: true });
  const [name, setName] = React.useState(mine?.name ?? page.personalName ?? "");
  const [how, setHow] = React.useState<"family" | "friend" | null>(
    mine?.relation === "friend" ? "friend" : mine?.relation ? "family" : null,
  );
  const [relation, setRelation] = React.useState<CardFamilyRelation | "">(
    mine?.relation && mine.relation !== "friend" ? mine.relation : "",
  );
  const [message, setMessage] = React.useState(mine?.message ?? "");
  const [voice, setVoice] = React.useState<VoiceTake | null>(
    mine?.audioPath ? { kind: "kept", path: mine.audioPath, seconds: mine.audioSeconds, url: mine.audioUrl } : null,
  );
  const [photo, setPhoto] = React.useState<Photo | null>(
    mine?.photoPath ? { kind: "kept", path: mine.photoPath, url: mine.photoUrl } : null,
  );
  const [ink, setInk] = React.useState<InkDraft>(() => draftOf(mine?.ink));
  const [email, setEmail] = React.useState(mine?.email ?? "");
  const picker = React.useRef<HTMLInputElement | null>(null);
  const honeypot = React.useRef<HTMLInputElement | null>(null);
  const pronoun = pronounOf(page.sex);
  const first = page.firstName;

  const named = !!page.viewerName || name.trim().length > 0;
  const placed = !page.asksHow || how === "friend" || (how === "family" && relation !== "");
  const something = !!message.trim() || !!voice || !!photo || !!inkOf(ink);
  const ready = named && placed && something;
  const chosen: CardRelation | null = !page.asksHow ? null : how === "friend" ? "friend" : relation || null;

  async function send(): Promise<{ error?: string }> {
    try {
      let audioPath: string | null = null;
      let audioSeconds: number | null = null;
      if (voice?.kind === "kept") {
        audioPath = voice.path;
        audioSeconds = voice.seconds;
      } else if (voice?.kind === "new") {
        audioPath = await uploadCardFileByLink(page.token, "audio", voice.blob, voice.type);
        audioSeconds = voice.seconds;
      }
      let photoPath: string | null = null;
      if (photo?.kind === "kept") photoPath = photo.path;
      else if (photo?.kind === "new") {
        photoPath = await uploadCardFileByLink(page.token, "photo", photo.file, photo.file.type);
      }
      return await post("/api/cards/sign", {
        token: page.token,
        name,
        relation: chosen,
        message,
        audioPath,
        audioSeconds,
        photoPath,
        ink: inkOf(ink),
        email: page.viewerName ? null : email,
        website: honeypot.current?.value ?? "",
      });
    } catch (error) {
      return { error: error instanceof Error ? error.message : "A file didn’t upload. Try again." };
    }
  }

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) sign.run("sign", send, { onSuccess: onDone });
      }}
    >
      {page.viewerName ? (
        <p className="text-[15px] text-muted-foreground">
          signing as <span className="font-medium text-foreground">{page.viewerName}</span>
        </p>
      ) : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="card-link-name" className="text-sm font-medium">
            your name
          </label>
          <Input
            id="card-link-name"
            className="h-11"
            autoComplete="name"
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={sign.pending}
          />
        </div>
      )}

      {page.asksHow ? (
        <fieldset className="flex flex-col gap-2" disabled={sign.pending}>
          <legend className="mb-2 text-sm font-medium">how do you know {first}?</legend>
          <div className="flex gap-2">
            {(["family", "friend"] as const).map((value) => (
              <label key={value} className="relative">
                <input
                  type="radio"
                  name="how"
                  value={value}
                  checked={how === value}
                  onChange={() => setHow(value)}
                  className="peer absolute size-px opacity-0"
                />
                <span className="flex h-11 cursor-pointer items-center rounded-lg border border-input px-4 text-sm font-medium peer-checked:border-foreground peer-checked:bg-foreground peer-checked:text-background peer-focus-visible:ring-3 peer-focus-visible:ring-ring/50">
                  {value}
                </span>
              </label>
            ))}
          </div>
          {how === "family" ? (
            <div className="mt-2 flex flex-col gap-1.5">
              <label htmlFor="card-link-relation" className="text-sm font-medium">
                you’re {pronoun}
              </label>
              <select
                id="card-link-relation"
                value={relation}
                onChange={(e) => setRelation(e.target.value as CardFamilyRelation | "")}
                className="h-11 w-full rounded-lg border border-input bg-background px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              >
                <option value="" disabled>
                  pick one
                </option>
                {CARD_FAMILY_RELATIONS.map((r) => (
                  <option key={r} value={r}>
                    {relationLabel(r)}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </fieldset>
      ) : null}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="card-link-message" className="text-sm font-medium">
          message
        </label>
        <Textarea
          id="card-link-message"
          rows={4}
          value={message}
          maxLength={CARD_MESSAGE_MAX}
          onChange={(e) => setMessage(e.target.value)}
          disabled={sign.pending}
        />
      </div>

      <InkField part="sign" value={ink} onChange={setInk} disabled={sign.pending} />

      <VoiceRecorder value={voice} onChange={setVoice} disabled={sign.pending} />

      {photo ? (
        <div className="relative self-start">
          {photo.url ? (
            // eslint-disable-next-line @next/next/no-img-element -- a picked file, or a signed link
            <img src={photo.url} alt="your photo" className="max-h-40 rounded-lg object-contain" />
          ) : (
            <span className="text-sm">photo</span>
          )}
          <Button
            type="button"
            size="icon-sm"
            variant="secondary"
            aria-label="remove photo"
            className="absolute top-1 right-1"
            disabled={sign.pending}
            onClick={() => setPhoto(null)}
          >
            <XIcon aria-hidden />
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="h-11 self-start"
          disabled={sign.pending}
          onClick={() => picker.current?.click()}
        >
          <ImagePlusIcon aria-hidden />
          add a photo
        </Button>
      )}
      <input
        ref={picker}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const { compressImage } = await import("@/lib/image");
          const small = await compressImage(file, { maxEdge: CARD_PHOTO_EDGE });
          if (!small) {
            sign.setError("That photo can’t be used. Try another.");
            return;
          }
          setPhoto({ kind: "new", file: small, url: URL.createObjectURL(small) });
        }}
      />

      <InkField part="draw" value={ink} onChange={setInk} disabled={sign.pending} />

      {/* Decision 16: asked only here, signed out, for the thank-you alone. */}
      {page.viewerName ? null : (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="card-link-email" className="text-sm font-medium">
            email for {possessive(first)} thank-you (optional)
          </label>
          <Input
            id="card-link-email"
            className="h-11"
            type="email"
            inputMode="email"
            autoComplete="email"
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={sign.pending}
          />
        </div>
      )}

      {/* Left empty by people; a bot that fills every field fills this. */}
      <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
        <label htmlFor="card-link-website">website</label>
        <input ref={honeypot} id="card-link-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <PendingButton
          type="submit"
          className="h-12 flex-1 sm:flex-none sm:px-6"
          pending={sign.pendingKey === "sign"}
          pendingLabel="signing…"
          disabled={sign.pending || !ready}
        >
          {mine ? "save changes" : "sign card"}
        </PendingButton>
        {onCancel ? (
          <Button type="button" variant="ghost" className="h-12" onClick={onCancel} disabled={sign.pending}>
            cancel
          </Button>
        ) : null}
      </div>
      <FormError>{sign.error}</FormError>
    </form>
  );
}

/** A personal link's relative, signed: their entry is waiting for them. */
function ClaimEntry({ first, url }: { first: string; url: string }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
      <h3 className="text-base font-bold">you’re on {possessive(first)} family tree.</h3>
      <p className="text-sm text-muted-foreground">claim your entry to add your side of the family.</p>
      <Button nativeButton={false} className="h-11 self-start px-4" render={<a href={url} />}>
        claim your entry
      </Button>
    </div>
  );
}

/**
 * Ask to join the person's home tree (decision 11), for family who'd pass
 * its gate: filled in with their name and the relation they gave; a Root
 * answers it. It needs an email, as every ask does.
 */
function JoinTree({ page }: { page: LivePage }) {
  const join = useAction({ inline: true });
  const [asking, setAsking] = React.useState(false);
  const [asked, setAsked] = React.useState(false);
  const [names] = React.useState(() => {
    const parts = (page.mine?.name ?? "").trim().split(/\s+/);
    return { first: parts[0] ?? "", last: parts.slice(1).join(" ") };
  });
  const [firstName, setFirstName] = React.useState(names.first);
  const [lastName, setLastName] = React.useState(names.last);
  const [email, setEmail] = React.useState(page.viewerEmail ?? "");
  const [consented, setConsented] = React.useState(false);

  React.useEffect(() => noteSeen(page.token, "join_shown"), [page.token]);

  if (asked) {
    return (
      <div className="flex flex-col gap-1 rounded-xl border border-border p-4" role="status">
        <h3 className="text-base font-bold">asked.</h3>
        <p className="text-sm text-muted-foreground">
          a Root of {possessive(page.firstName)} family tree will look at it, and email you.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2.5 rounded-xl border border-border p-4">
      <h3 className="text-base font-bold">join {possessive(page.firstName)} family tree</h3>
      <p className="text-sm text-muted-foreground">{joinLine(page.mine?.relation ?? null, page.sex)}</p>
      {asking ? (
        <form
          className="flex flex-col gap-3"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            join.run(
              "join",
              () => post("/api/cards/join", { token: page.token, firstName, lastName, email, consent: consented }),
              { onSuccess: () => setAsked(true) },
            );
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="card-join-first" className="text-sm font-medium">
                first name
              </label>
              <Input
                id="card-join-first"
                className="h-11"
                autoComplete="given-name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="card-join-last" className="text-sm font-medium">
                last name
              </label>
              <Input
                id="card-join-last"
                className="h-11"
                autoComplete="family-name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="card-join-email" className="text-sm font-medium">
              email
            </label>
            <Input
              id="card-join-email"
              className="h-11"
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <InviteConsent id="card-join-consent" checked={consented} onCheckedChange={setConsented} />
          <PendingButton
            type="submit"
            className="h-11 self-start px-4"
            pending={join.pending}
            pendingLabel="asking…"
            disabled={join.pending || !consented || !firstName.trim() || !lastName.trim() || !email.trim()}
          >
            ask to join
          </PendingButton>
          <FormError>{join.error}</FormError>
        </form>
      ) : (
        <Button className="h-11 self-start px-4" onClick={() => setAsking(true)}>
          ask to join
        </Button>
      )}
    </div>
  );
}
