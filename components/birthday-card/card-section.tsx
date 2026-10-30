"use client";

import * as React from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";

import { CardOpening } from "@/components/birthday-card/card-opening";
import { CardPage, type SignerOf } from "@/components/birthday-card/card-pages";
import { EnvelopeMark } from "@/components/birthday-card/envelope-mark";
import { InkField } from "@/components/birthday-card/ink-pad";
import { VoiceRecorder, type VoiceTake } from "@/components/birthday-card/voice-recorder";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { ShareMessage } from "@/components/share-message";
import { setPersonSheet, usePersonSheet } from "@/components/tree/use-person-sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import {
  deleteBirthdayCard,
  deleteCardSignature,
  listCardRelatives,
  makeCardLink,
  makeCardPersonalLink,
  markCardOpened,
  noteCardShared,
  openBirthdayCard,
  signBirthdayCard,
  startBirthdayCard,
  turnOffCardLink,
} from "@/app/actions/birthday-cards";
import {
  CARD_MESSAGE_MAX,
  CARD_PHOTO_EDGE,
  cardDay,
  possessive,
  signedSoFar,
  signedYourCard,
  type BirthdayCardView,
  type CardSignatureView,
  type PersonCards,
} from "@/lib/birthday-cards";
import { draftOf, inkOf, type InkDraft } from "@/lib/card-ink";
import { cardLinkMessage, relationWords, type CardRelative } from "@/lib/card-links";
import { discardCardFile, uploadCardFile } from "@/lib/card-upload";
import type { Relation } from "@/lib/connection-path";
import type { LeafShape } from "@/lib/leaf-shapes";

/** "her", "his", "their", by what the entry says. */
function their(sex: string | null | undefined): string {
  return sex === "female" ? "her" : sex === "male" ? "his" : "their";
}

const firstOf = (name: string) => name.split(" ")[0] || name;

/** The device's zone, where a card opens if nothing says where they live. */
function deviceZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

type Photo = { kind: "new"; file: File; url: string } | { kind: "kept"; path: string; url: string | null };

/**
 * Someone's birthday card on their sheet (Step 217). Before the day, for
 * those who may sign it: who's collecting, who has signed (and what), and
 * the viewer's own signature to write, record, add a photo to, change or
 * take off. For a manager with none started yet: start one. On the day and
 * after: the person opens theirs (the envelope first), and its managers and
 * signers open it too. Earlier years below. Nothing for the person before
 * the day: the database doesn't say a card exists.
 */
export function BirthdayCardSection({
  personId,
  name,
  sex,
  leaf,
  viewerPersonId,
  leafOf,
  describeConnection,
}: {
  personId: string;
  /** As the sheet names them. */
  name: string;
  sex: string | null;
  /** Their leaf, for the envelope's tag. */
  leaf: LeafShape;
  /** The viewer's own entry, to say who each signer is to them. */
  viewerPersonId: string | null;
  /** Someone's leaf on this canvas, if they're on it. */
  leafOf?: (personId: string) => LeafShape | null;
  describeConnection?: (fromId: string, toId: string) => Relation | null;
}) {
  const cards = usePersonSheet(personId)?.sheet.cards;
  const first = firstOf(name);
  const [opening, setOpening] = React.useState<BirthdayCardView | null>(null);
  const past = useAction();
  const forRecipient = cards?.current?.recipient ?? false;

  const signer = React.useCallback<SignerOf>(
    (s) => {
      const leafShape = s.personId ? (leafOf?.(s.personId) ?? null) : null;
      if (s.mine) return { leaf: leafShape, relation: "you" };
      const rel =
        s.personId && viewerPersonId && s.personId !== viewerPersonId
          ? describeConnection?.(s.personId, viewerPersonId)
          : null;
      if (rel && "term" in rel) return { leaf: leafShape, relation: `your ${rel.term.toLowerCase()}` };
      // Someone who signed through the link, in their own words (Step 217.3).
      return {
        leaf: leafShape,
        relation: relationWords(s.relation, forRecipient ? "your" : possessive(first)),
      };
    },
    [leafOf, describeConnection, viewerPersonId, forRecipient, first],
  );

  if (!cards || (!cards.current && !cards.startsOn && cards.past.length === 0)) return null;
  const update = (next: PersonCards | undefined) => {
    if (next) setPersonSheet(personId, "cards", () => next);
  };
  const { current } = cards;

  return (
    <section className="flex flex-col gap-4 border-t border-border pt-5">
      {current && !current.isOpen ? (
        <SignCard card={current} personId={personId} first={first} sex={sex} signer={signer} onCards={update} />
      ) : null}

      {current?.isOpen ? (
        <div className="flex flex-col gap-3 rounded-xl border border-kraft-line/40 bg-cake-sponge p-4">
          <div className="flex items-center gap-3">
            <EnvelopeMark />
            <div className="flex flex-col">
              <h2 className="text-[15px] font-bold">
                {current.recipient ? "your birthday card" : `${possessive(first)} birthday card`}
              </h2>
              <p className="text-[13px] text-muted-foreground">
                {current.recipient
                  ? signedYourCard(current.signatures.map((s) => firstOf(s.name)))
                  : `it opened on ${cardDay(current.opensOn)}.`}
              </p>
            </div>
          </div>
          <Button className="self-start" onClick={() => setOpening(current)}>
            {current.recipient ? "open your card" : "open the card"}
          </Button>
        </div>
      ) : null}

      {!current && cards.startsOn ? (
        <StartCard personId={personId} first={first} startsOn={cards.startsOn} onCards={update} />
      ) : null}

      {cards.past.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">earlier cards</h2>
          <ul className="flex flex-col gap-1">
            {cards.past.map((p) => (
              <li key={p.id}>
                <PendingButton
                  variant="ghost"
                  size="sm"
                  pending={past.pendingKey === p.id}
                  disabled={past.pending}
                  onClick={() =>
                    past.run(p.id, () => openBirthdayCard(p.id), {
                      onSuccess: ({ card }) => {
                        if (card) setOpening(card);
                      },
                    })
                  }
                >
                  {p.year} · {p.count === 1 ? "1 signature" : `${p.count} signatures`}
                </PendingButton>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {opening ? (
        <CardOpening
          card={opening}
          firstName={first}
          leaf={leaf}
          signer={signer}
          open
          onOpenChange={(open) => {
            if (!open) setOpening(null);
          }}
          onFirstLook={() => {
            void markCardOpened(opening.id);
            if (current && current.id === opening.id) {
              update({ ...cards, current: { ...current, openedAt: new Date().toISOString() } });
            }
          }}
        />
      ) : null}
    </section>
  );
}

function StartCard({
  personId,
  first,
  startsOn,
  onCards,
}: {
  personId: string;
  first: string;
  startsOn: string;
  onCards: (cards: PersonCards | undefined) => void;
}) {
  const start = useAction({ inline: true });
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-kraft-line/40 bg-cake-sponge p-4">
      <div className="flex items-center gap-3">
        <EnvelopeMark />
        <p className="text-[15px]">
          {possessive(first)} birthday is on {cardDay(startsOn)}.
        </p>
      </div>
      <PendingButton
        className="self-start"
        pending={start.pending}
        pendingLabel="starting…"
        onClick={() =>
          start.run("start", () => startBirthdayCard({ personId, timeZone: deviceZone() }), {
            onSuccess: ({ cards }) => onCards(cards),
          })
        }
      >
        start a card
      </PendingButton>
      <FormError>{start.error}</FormError>
    </div>
  );
}

function SignCard({
  card,
  personId,
  first,
  sex,
  signer,
  onCards,
}: {
  card: BirthdayCardView;
  personId: string;
  first: string;
  sex: string | null;
  signer: SignerOf;
  onCards: (cards: PersonCards | undefined) => void;
}) {
  const [showAll, setShowAll] = React.useState(false);
  const others = card.signatures.filter((s) => !s.mine);
  const mine = card.signatures.find((s) => s.mine) ?? null;
  const remove = useAction();

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-kraft-line/40">
      <div className="flex items-center gap-3 border-b border-kraft-line/40 bg-cake-sponge px-4 py-3">
        <EnvelopeMark />
        <div className="flex flex-col">
          <h2 className="text-[15px] font-bold">sign {possessive(first)} card</h2>
          <p className="text-[13px] text-muted-foreground">
            {their(sex)} birthday is on {cardDay(card.opensOn)}. {firstOf(card.startedBy)} is collecting.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 p-4">
        <div className="flex items-center gap-2">
          <p className="flex-1 text-[13px] text-muted-foreground">
            {signedSoFar(others.map((s) => firstOf(s.name)))}
          </p>
          {others.length > 0 ? (
            <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "hide them" : "see them"}
            </Button>
          ) : null}
        </div>

        {showAll ? (
          <ul className="flex flex-col gap-2">
            {others.map((s) => (
              <li key={s.id} className="relative rounded-lg border border-kraft-line/30 bg-cake-sponge">
                <SignedRow signature={s} signer={signer} />
                {card.manager ? (
                  <ConfirmButton
                    size="icon-sm"
                    variant="ghost"
                    aria-label={`take ${firstOf(s.name)}’s signature off`}
                    className="absolute top-2 right-2"
                    disabled={remove.pending}
                    confirm={{
                      title: `Take ${firstOf(s.name)}’s signature off ${possessive(first)} card?`,
                      description: "Their message, voice memo and photo go with it.",
                      confirmLabel: "take it off",
                      pendingLabel: "taking it off…",
                      destructive: true,
                      onConfirm: () => deleteCardSignature({ personId, signatureId: s.id }),
                      onSuccess: ({ cards }) => onCards(cards),
                    }}
                  >
                    <XIcon aria-hidden />
                  </ConfirmButton>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}

        {card.signing ? (
          <SignForm key={mine?.updatedAt ?? "new"} card={card} personId={personId} mine={mine} onCards={onCards} />
        ) : (
          <p className="text-sm text-muted-foreground">signing has closed.</p>
        )}

        {card.link ? (
          <ShareCard card={card} personId={personId} first={first} sex={sex} onCards={onCards} />
        ) : null}

        {card.manager ? (
          <ConfirmButton
            variant="link"
            size="sm"
            className="h-auto self-start p-0 text-muted-foreground"
            confirm={{
              title: `Delete ${possessive(first)} card?`,
              description: "Every signature on it goes too.\nThis cannot be undone.",
              confirmLabel: "delete",
              pendingLabel: "deleting…",
              destructive: true,
              onConfirm: () => deleteBirthdayCard({ personId, cardId: card.id }),
              onSuccess: ({ cards }) => onCards(cards),
            }}
          >
            delete the card
          </ConfirmButton>
        ) : null}
      </div>
    </div>
  );
}

/** Someone else's signature, before the day, as the list shows it. */
function SignedRow({ signature, signer }: { signature: CardSignatureView; signer: SignerOf }) {
  return (
    <div className="max-h-96 overflow-y-auto [&_article]:p-3 [&_article]:pr-10 [&_p]:text-[15px]">
      <CardPage signature={signature} signer={signer} />
    </div>
  );
}

function SignForm({
  card,
  personId,
  mine,
  onCards,
}: {
  card: BirthdayCardView;
  personId: string;
  mine: CardSignatureView | null;
  onCards: (cards: PersonCards | undefined) => void;
}) {
  const sign = useAction({ inline: true });
  const [message, setMessage] = React.useState(mine?.message ?? "");
  const [voice, setVoice] = React.useState<VoiceTake | null>(
    mine?.audioPath ? { kind: "kept", path: mine.audioPath, seconds: mine.audioSeconds, url: mine.audioUrl } : null,
  );
  const [photo, setPhoto] = React.useState<Photo | null>(
    mine?.photoPath ? { kind: "kept", path: mine.photoPath, url: mine.photoUrl } : null,
  );
  const [ink, setInk] = React.useState<InkDraft>(() => draftOf(mine?.ink));
  const picker = React.useRef<HTMLInputElement | null>(null);
  const empty = !message.trim() && !voice && !photo && !inkOf(ink);

  async function send() {
    const sent: string[] = [];
    try {
      let audioPath: string | null = null;
      let audioSeconds: number | null = null;
      if (voice?.kind === "kept") {
        audioPath = voice.path;
        audioSeconds = voice.seconds;
      } else if (voice?.kind === "new") {
        audioPath = await uploadCardFile(card.id, voice.blob, voice.type);
        sent.push(audioPath);
        audioSeconds = voice.seconds;
      }
      let photoPath: string | null = null;
      if (photo?.kind === "kept") photoPath = photo.path;
      else if (photo?.kind === "new") {
        photoPath = await uploadCardFile(card.id, photo.file, photo.file.type);
        sent.push(photoPath);
      }
      const answer = await signBirthdayCard({
        personId,
        cardId: card.id,
        message,
        audioPath,
        audioSeconds,
        photoPath,
        ink: inkOf(ink),
      });
      if (answer.error) sent.forEach((p) => void discardCardFile(p));
      return answer;
    } catch {
      sent.forEach((p) => void discardCardFile(p));
      return { error: "A file didn’t upload. Try again." };
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold">your signature</h3>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`card-message-${card.id}`} className="text-[13px] font-medium">
          message
        </label>
        <Textarea
          id={`card-message-${card.id}`}
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
          className="self-start"
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

      <div className="flex flex-wrap items-center gap-2">
        <PendingButton
          pending={sign.pendingKey === "sign"}
          pendingLabel="signing…"
          disabled={sign.pending || empty}
          onClick={() => sign.run("sign", send, { onSuccess: ({ cards }) => onCards(cards) })}
        >
          {mine ? "save changes" : "sign card"}
        </PendingButton>
        {mine ? (
          <ConfirmButton
            variant="ghost"
            disabled={sign.pending}
            confirm={{
              title: "Take your signature off?",
              description: "Your message, voice memo, photo and drawing go with it.",
              confirmLabel: "take it off",
              pendingLabel: "taking it off…",
              destructive: true,
              onConfirm: () => deleteCardSignature({ personId, signatureId: mine.id }),
              onSuccess: ({ cards }) => onCards(cards),
            }}
          >
            take it off
          </ConfirmButton>
        ) : null}
      </div>
      <FormError>{sign.error}</FormError>
    </div>
  );
}

/**
 * A manager's ways to send the card round (Step 217.3): its public link,
 * for the family chat, with the message ready (only a parent turns it on
 * for someone under 18), and a link of their own for each relative on the
 * tree with no account, which is also their claim link. The link's address
 * shows once, when it's made: only its hash is kept, so a link already on is
 * made again to share it again.
 */
function ShareCard({
  card,
  personId,
  first,
  sex,
  onCards,
}: {
  card: BirthdayCardView;
  personId: string;
  first: string;
  sex: string | null;
  onCards: (cards: PersonCards | undefined) => void;
}) {
  const action = useAction({ inline: true });
  const [made, setMade] = React.useState<{ message: string; token: string } | null>(null);
  const link = card.link;
  if (!link) return null;

  function make() {
    action.run("make", () => makeCardLink({ personId, cardId: card.id }), {
      onSuccess: ({ url, token, cards }) => {
        if (url && token) {
          setMade({ message: cardLinkMessage({ url, firstName: first, opensOn: card.opensOn, sex }), token });
        }
        onCards(cards);
      },
    });
  }

  return (
    <div className="flex flex-col gap-3 border-t border-kraft-line/30 pt-4">
      <div className="flex flex-col gap-0.5">
        <h3 className="text-sm font-semibold">share the card</h3>
        <p className="text-[13px] text-muted-foreground">
          anyone with the link can sign it, and then sees everyone’s.
        </p>
      </div>
      {!link.mayTurnOn ? (
        <p className="text-sm text-muted-foreground">only a parent can share {possessive(first)} card.</p>
      ) : made && link.on ? (
        <ShareMessage message={made.message} onShared={(channel) => void noteCardShared(made.token, channel)} />
      ) : link.on ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm">the link is on.</p>
          <div className="flex flex-wrap gap-2">
            <ConfirmButton
              variant="outline"
              disabled={action.pending}
              confirm={{
                title: "Make a new link?",
                description: "The link you shared stops working.",
                confirmLabel: "make a new link",
                pendingLabel: "making…",
                onConfirm: () => makeCardLink({ personId, cardId: card.id }),
                onSuccess: ({ url, token, cards }) => {
                  if (url && token) {
                    setMade({
                      message: cardLinkMessage({ url, firstName: first, opensOn: card.opensOn, sex }),
                      token,
                    });
                  }
                  onCards(cards);
                },
              }}
            >
              new link
            </ConfirmButton>
            <PendingButton
              variant="ghost"
              pending={action.pendingKey === "off"}
              pendingLabel="turning off…"
              disabled={action.pending}
              onClick={() =>
                action.run("off", () => turnOffCardLink({ personId, cardId: card.id }), {
                  onSuccess: ({ cards }) => {
                    setMade(null);
                    onCards(cards);
                  },
                })
              }
            >
              turn it off
            </PendingButton>
          </div>
        </div>
      ) : (
        <PendingButton
          className="self-start"
          pending={action.pendingKey === "make"}
          pendingLabel="making…"
          disabled={action.pending}
          onClick={make}
        >
          make a link
        </PendingButton>
      )}
      <FormError>{action.error}</FormError>
      <SendRelativesTheirLinks card={card} first={first} sex={sex} />
    </div>
  );
}

/** Relatives on the tree with no account, each with a link of their own. */
function SendRelativesTheirLinks({
  card,
  first,
  sex,
}: {
  card: BirthdayCardView;
  first: string;
  sex: string | null;
}) {
  const load = useAction({ inline: true });
  const send = useAction({ inline: true });
  const [relatives, setRelatives] = React.useState<CardRelative[] | null>(null);
  const [sent, setSent] = React.useState<Record<string, { message: string; token: string; inviteToken: string }>>(
    {},
  );

  if (!relatives) {
    return (
      <div className="flex flex-col gap-1">
        <PendingButton
          variant="link"
          size="sm"
          className="h-auto self-start p-0"
          pending={load.pending}
          pendingLabel="looking…"
          onClick={() =>
            load.run("load", () => listCardRelatives(card.id), {
              onSuccess: ({ relatives }) => setRelatives(relatives ?? []),
            })
          }
        >
          send relatives their own link
        </PendingButton>
        <FormError>{load.error}</FormError>
      </div>
    );
  }

  if (relatives.length === 0) {
    return (
      <p className="text-[13px] text-muted-foreground">
        everyone close to {first} on the tree has an account, or none you can send a link.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <h4 className="text-[13px] font-semibold">relatives with no account</h4>
      <ul className="flex flex-col gap-3">
        {relatives.map((r) => {
          const done = sent[r.personId];
          return (
            <li key={r.personId} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="flex-1 text-sm">{r.name}</span>
                {r.signed ? (
                  <span className="text-[13px] text-muted-foreground">signed</span>
                ) : done ? null : (
                  <PendingButton
                    size="sm"
                    variant="outline"
                    pending={send.pendingKey === r.personId}
                    pendingLabel="making…"
                    disabled={send.pending}
                    onClick={() =>
                      send.run(
                        r.personId,
                        () => makeCardPersonalLink({ cardId: card.id, personId: r.personId, treeId: r.treeId }),
                        {
                          onSuccess: ({ url, token, inviteToken }) => {
                            if (!url || !token || !inviteToken) return;
                            const message = cardLinkMessage({ url, firstName: first, opensOn: card.opensOn, sex });
                            setSent((prev) => ({ ...prev, [r.personId]: { message, token, inviteToken } }));
                          },
                        },
                      )
                    }
                  >
                    send {r.firstName} their link
                  </PendingButton>
                )}
              </div>
              {done ? (
                <ShareMessage
                  message={done.message}
                  inviteToken={done.inviteToken}
                  onShared={(channel) => void noteCardShared(done.token, channel)}
                />
              ) : null}
            </li>
          );
        })}
      </ul>
      <FormError>{send.error}</FormError>
    </div>
  );
}
