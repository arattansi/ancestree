"use client";

import * as React from "react";

import {
  hideCardSignature,
  markCardOpened,
  openBirthdayCard,
  setMyTimeZone,
} from "@/app/actions/birthday-cards";
import { CardOpening } from "@/components/birthday-card/card-opening";
import type { SignerOf } from "@/components/birthday-card/card-pages";
import { PendingButton } from "@/components/pending-button";
import { useAction } from "@/components/use-action";
import type { BirthdayCardView } from "@/lib/birthday-cards";
import type { LeafShape } from "@/lib/leaf-shapes";

/**
 * On their birthday, at the foot of their tree (Step 217): "happy birthday,
 * Ada. your card is here." and the button that opens it, envelope first,
 * each page theirs to hide from everyone else (Step 217.5). Gone once
 * they've looked.
 */
export function CardReadyPill({
  cardId,
  firstName,
  leaf,
  signer,
}: {
  cardId: string;
  firstName: string;
  leaf: LeafShape;
  signer: SignerOf;
}) {
  const [card, setCard] = React.useState<BirthdayCardView | null>(null);
  const [done, setDone] = React.useState(false);
  const open = useAction();
  const hiding = useAction();
  if (done && !card) return null;
  return (
    <>
      {done ? null : (
        <div className="absolute bottom-20 left-1/2 z-20 sm:bottom-6 flex w-max max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background py-2 pr-2 pl-5 shadow-lg">
          <span className="text-sm">happy birthday, {firstName}. your card is here.</span>
          <PendingButton
            size="sm"
            className="shrink-0 rounded-full"
            pending={open.pending}
            pendingLabel="opening…"
            onClick={() =>
              open.run("open", () => openBirthdayCard(cardId), {
                onSuccess: ({ card }) => {
                  if (card) setCard(card);
                },
              })
            }
          >
            open your card
          </PendingButton>
        </div>
      )}
      {card ? (
        <CardOpening
          card={card}
          firstName={firstName}
          leaf={leaf}
          signer={signer}
          open
          onOpenChange={(isOpen) => {
            if (!isOpen) setCard(null);
          }}
          onFirstLook={() => {
            setDone(true);
            void markCardOpened(cardId);
          }}
          hide={{
            pendingId: hiding.pendingKey,
            onHide: (s) =>
              hiding.run(
                s.id,
                () =>
                  hideCardSignature({ personId: card.personId, cardId, signatureId: s.id, hidden: !s.hidden }),
                {
                  onSuccess: ({ card: next }) => {
                    if (next) setCard(next);
                  },
                },
              ),
          }}
        />
      ) : null}
    </>
  );
}

/** How long a reported zone is kept before it's said again. */
const ZONE_KEY = "ancestree.time-zone";

/**
 * Tells the server the device's time zone (Step 217), at most once a day a
 * browser: a card opens at its person's midnight, and with nothing better,
 * that's where their phone or computer says they are.
 */
export function TimeZoneReport() {
  React.useEffect(() => {
    let zone: string | undefined;
    try {
      zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!zone) return;
    const today = new Date().toISOString().slice(0, 10);
    const said = `${zone} ${today}`;
    try {
      if (window.localStorage.getItem(ZONE_KEY) === said) return;
      window.localStorage.setItem(ZONE_KEY, said);
    } catch {
      // Storage refused: say it anyway, it's one small call.
    }
    void setMyTimeZone(zone);
  }, []);
  return null;
}
