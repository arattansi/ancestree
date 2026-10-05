"use client";

import * as React from "react";
import { MousePointer2 } from "lucide-react";

import { AccountTypeBadge } from "@/components/account-type-badge";
import { typeOut, useSamplePlay } from "@/components/marketing/demo-play";
import { WatchAgain } from "@/components/marketing/watch-again";
import { LeafCard } from "@/components/tree/leaf-card";
import { Button } from "@/components/ui/button";
import { marketingEntry } from "@/lib/marketing-entry";
import { nativeLeaf } from "@/lib/native-leaf";
import { cn } from "@/lib/utils";

/**
 * The /features "collaborate" sample (Step 115), kept no taller than the
 * words beside it: André Franklin's leaf is clicked and his details open
 * beside it, as the person sheet does, with its "Invite André Franklin to
 * claim this entry". An address is typed, the invite goes, and André
 * claims it: his leaf gets the Leaf mark. It plays once, then offers
 * **watch again**. Nothing is sent; it's a picture that moves.
 */

type Stage = "closed" | "open" | "sent" | "claimed";

const ANDRE = marketingEntry({
  id: "andre",
  first: "André",
  last: "Franklin",
  maiden: null,
  city: "Atlanta",
  country: "United States",
  account: null,
});
const CLAIMED = { ...ANDRE, account_type: "member" as const };
const LEAF = nativeLeaf({ city_of_birth: "Atlanta, United States" });
const EMAIL = "andre@example.com";

/** How small the leaf is drawn. */
const SCALE = 0.6;

/** `turn`: its place in a `DemoQueue`. */
export function ClaimDemo({ turn }: { turn?: number }) {
  const [stage, setStage] = React.useState<Stage>("closed");
  const [email, setEmail] = React.useState("");
  // The pointer: off to the side, on the leaf, or pressing it.
  const [pointer, setPointer] = React.useState<"away" | "on" | "press">("away");
  const [pressing, setPressing] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const { reduced, ended, replay } = useSamplePlay(
    box,
    async (wait) => {
      setPointer("on");
      await wait(700);
      setPointer("press");
      await wait(150);
      setPointer("away");
      setStage("open");
      await wait(900);
      await typeOut(EMAIL, setEmail, wait, 60);
      await wait(350);
      setPressing(true);
      await wait(180);
      setPressing(false);
      setStage("sent");
      await wait(1600);
      setStage("claimed");
    },
    () => {
      setStage("closed");
      setEmail("");
      setPointer("away");
      setPressing(false);
    },
    turn,
  );
  const shown = reduced ? "claimed" : stage;
  const open = shown !== "closed";

  return (
    <div
      ref={box}
      role="group"
      aria-label="André Franklin’s leaf opened, an invite sent to claim it, and André claiming it"
      className="flex min-h-40 items-center gap-3 lg:h-40"
    >
      <div
        className="relative shrink-0"
        style={{ width: 208 * SCALE, height: 112 * SCALE }}
      >
        <div
          className="absolute top-0 left-0"
          style={{ transform: `scale(${SCALE})`, transformOrigin: "0 0" }}
        >
          <LeafCard
            key={shown === "claimed" ? "claimed" : "unclaimed"}
            person={shown === "claimed" ? CLAIMED : ANDRE}
            leaf={LEAF}
            selected={open}
            isSelf={false}
            quiet
          />
        </div>
        <MousePointer2
          aria-hidden
          className={cn(
            "absolute size-5 fill-background text-foreground transition-all duration-500 ease-out",
            pointer === "away"
              ? "top-[120%] left-[120%] opacity-0"
              : "top-1/2 left-1/2 opacity-100",
            pointer === "press" && "scale-90",
          )}
        />
      </div>
      <div
        className={cn(
          "flex min-h-[8.5rem] min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-card p-3 text-sm shadow-sm transition-[opacity,translate] duration-300 ease-out",
          open ? "translate-x-0 opacity-100" : "translate-x-4 opacity-0",
        )}
      >
        <div className="flex flex-col">
          <p className="font-medium">André Franklin</p>
          <p className="text-xs text-muted-foreground">
            Atlanta, United States
          </p>
        </div>
        {shown === "claimed" ? (
          <div
            key="claimed"
            className="flex animate-[leaf-settle_300ms_ease-out_both] items-center gap-2 text-xs text-muted-foreground"
          >
            <AccountTypeBadge role="member" />
            Claimed by André
          </div>
        ) : (
          <div className="flex flex-col gap-1.5 rounded-md border p-2">
            <p className="text-xs font-medium">
              Invite André Franklin to claim this entry
            </p>
            {shown === "sent" ? (
              <p className="text-xs text-muted-foreground">
                Invite sent to {EMAIL}.
              </p>
            ) : (
              <div className="flex gap-1.5">
                <span
                  className={cn(
                    "flex h-7 min-w-0 flex-1 items-center truncate rounded-lg border border-input bg-background px-2 text-xs dark:bg-input/30",
                    email ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {email || "them@example.com"}
                </span>
                <Button
                  type="button"
                  size="sm"
                  tabIndex={-1}
                  aria-hidden
                  className={cn(pressing && "translate-y-px opacity-80")}
                >
                  send invite
                </Button>
              </div>
            )}
          </div>
        )}
        {ended && !reduced ? (
          <WatchAgain onClick={replay} className="mt-auto self-start" />
        ) : null}
      </div>
    </div>
  );
}
