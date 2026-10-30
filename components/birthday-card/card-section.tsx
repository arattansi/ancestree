"use client";

import * as React from "react";
import { ImagePlusIcon, XIcon } from "lucide-react";

import { CardOpening } from "@/components/birthday-card/card-opening";
import { CardPage, type SignerOf } from "@/components/birthday-card/card-pages";
import { EnvelopeMark } from "@/components/birthday-card/envelope-mark";
import { VoiceRecorder, type VoiceTake } from "@/components/birthday-card/voice-recorder";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { setPersonSheet, usePersonSheet } from "@/components/tree/use-person-sheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import {
  deleteBirthdayCard,
  deleteCardSignature,
  markCardOpened,
  openBirthdayCard,
  signBirthdayCard,
  startBirthdayCard,
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

  const signer = React.useCallback<SignerOf>(
    (s) => {
      const leafShape = s.personId ? (leafOf?.(s.personId) ?? null) : null;
      if (s.mine) return { leaf: leafShape, relation: "you" };
      const rel =
        s.personId && viewerPersonId && s.personId !== viewerPersonId
          ? describeConnection?.(s.personId, viewerPersonId)
          : null;
      return { leaf: leafShape, relation: rel && "term" in rel ? `your ${rel.term.toLowerCase()}` : null };
    },
    [leafOf, describeConnection, viewerPersonId],
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
  const picker = React.useRef<HTMLInputElement | null>(null);
  const empty = !message.trim() && !voice && !photo;

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
      const answer = await signBirthdayCard({ personId, cardId: card.id, message, audioPath, audioSeconds, photoPath });
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
