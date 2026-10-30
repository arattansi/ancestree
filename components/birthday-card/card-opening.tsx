"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";

import { CardEnvelope } from "@/components/birthday-card/card-envelope";
import { CardPages, type SignerOf } from "@/components/birthday-card/card-pages";
import { cardDay, signedYourCard, type BirthdayCardView } from "@/lib/birthday-cards";
import type { LeafShape } from "@/lib/leaf-shapes";

/** A wide screen opens a card like a book: two pages side by side. */
function useWide(): boolean {
  const [wide, setWide] = React.useState(false);
  React.useEffect(() => {
    const query = window.matchMedia("(min-width: 768px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

/**
 * A birthday card, opened (Step 217): over everything, dimmed behind. The
 * person's first look starts at the envelope, tied with twine, which they
 * pull or untie; then its pages. Anyone else, or the person again, goes
 * straight to the pages. `onFirstLook` runs as the envelope opens.
 */
export function CardOpening({
  card,
  firstName,
  leaf,
  signer,
  open,
  onOpenChange,
  onFirstLook,
}: {
  card: BirthdayCardView;
  firstName: string;
  /** The person's own leaf, for the envelope's tag. */
  leaf: LeafShape;
  signer: SignerOf;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFirstLook?: () => void;
}) {
  const wide = useWide();
  // Mounted each time it opens, so this starts over every time.
  const [reading, setReading] = React.useState(!(card.recipient && !card.openedAt));

  const names = card.signatures.map((s) => s.name.split(" ")[0] ?? s.name);
  const title = card.recipient ? "your birthday card" : `${firstName}’s birthday card`;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        {/* Drawn over a person's sheet too, itself a dialog. */}
        <DialogPrimitive.Backdrop
          forceRender
          className="fixed inset-0 z-50 bg-neutral-950/85 backdrop-blur-sm duration-200 data-closed:animate-out data-closed:fade-out-0 data-open:animate-in data-open:fade-in-0"
        />
        <DialogPrimitive.Popup className="fixed inset-0 z-50 flex h-dvh flex-col items-center overflow-y-auto px-4 pt-6 pb-6 text-white outline-none sm:px-8">
          <DialogPrimitive.Close
            aria-label="close"
            className="absolute top-4 right-4 flex size-11 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25"
          >
            <XIcon className="size-4" aria-hidden />
          </DialogPrimitive.Close>
          {reading ? (
            <div className="flex min-h-0 w-full max-w-[960px] flex-1 flex-col gap-3 pt-10 md:max-h-[760px]">
              <div className="flex flex-col gap-0.5">
                <DialogPrimitive.Title className="text-xl font-bold sm:text-2xl">{title}</DialogPrimitive.Title>
                <DialogPrimitive.Description className="text-[13px] text-white/75">
                  {cardDay(card.opensOn)} {card.year} ·{" "}
                  {card.signatures.length === 1 ? "1 signature" : `${card.signatures.length} signatures`}
                </DialogPrimitive.Description>
              </div>
              <div className="flex min-h-0 flex-1 flex-col">
                <CardPages
                  signatures={card.signatures}
                  signer={signer}
                  wide={wide}
                  endLabel="close"
                  onEnd={() => onOpenChange(false)}
                  onDark
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center">
              <div className="flex flex-col gap-1">
                <p className="text-sm text-white/75">{cardDay(card.opensOn)}</p>
                <DialogPrimitive.Title className="text-3xl font-bold tracking-tight">
                  happy birthday, {firstName}.
                </DialogPrimitive.Title>
              </div>
              <CardEnvelope
                firstName={firstName}
                leaf={leaf}
                count={card.signatures.length}
                scale={wide ? 1.5 : 1}
                onDark
                onOpened={() => {
                  onFirstLook?.();
                  setReading(true);
                }}
              />
              <DialogPrimitive.Description className="max-w-xs text-[15px] text-white/85">
                {signedYourCard(names)}
              </DialogPrimitive.Description>
            </div>
          )}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
