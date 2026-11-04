"use client";

import * as React from "react";
import { LockKeyhole, SendHorizontal } from "lucide-react";

import { typeOut, useSamplePlay } from "@/components/marketing/demo-play";
import { WatchAgain } from "@/components/marketing/watch-again";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { initialsOf } from "@/lib/messenger";
import { cn } from "@/lib/utils";

/**
 * The /features "direct-messaging" sample (Step 219): a conversation with
 * your unc as the messenger shows one (`messenger-panel.tsx`, small), his
 * name and who he is to you over it, an "encrypted chat" badge where the
 * lock is. Aalim's dialogue, word for word: his lines arrive, yours are
 * typed and sent, the older ones scrolling up out of the window. It plays
 * once, then offers **watch again**. Nothing is sent; it's a picture that
 * moves.
 */

type Line = { from: "unc" | "you"; text: string };

const UNC = { name: "Stone Curie", about: "Your Unc" };

const LINES: Line[] = [
  { from: "unc", text: "i can’t forward any messages" },
  { from: "you", text: "so?" },
  { from: "unc", text: "what else do you use messaging apps for?" },
  { from: "you", text: "to connect" },
  { from: "unc", text: "oh" },
  { from: "unc", text: "so how are you?" },
];

/** `turn`: its place in a `DemoQueue`. */
export function ChatDemo({ turn }: { turn?: number }) {
  // How many of the lines have been sent.
  const [sent, setSent] = React.useState(0);
  const [draft, setDraft] = React.useState("");
  const [pressing, setPressing] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);

  const { reduced, ended, replay } = useSamplePlay(
    box,
    async (wait) => {
      for (const [i, line] of LINES.entries()) {
        if (line.from === "unc") {
          // His second in a row comes sooner, as a run does.
          await wait(i === 0 ? 200 : LINES[i - 1].from === "unc" ? 900 : 1400);
        } else {
          await wait(900);
          await typeOut(line.text, setDraft, wait, 90);
          await wait(250);
          setPressing(true);
          await wait(160);
          setPressing(false);
          setDraft("");
        }
        setSent(i + 1);
      }
    },
    () => {
      setSent(0);
      setDraft("");
      setPressing(false);
    },
    turn,
  );
  const shown = reduced ? LINES.length : sent;

  return (
    <div
      ref={box}
      role="group"
      aria-label="A conversation with your unc, Stone Curie, in an encrypted chat"
      className="min-h-[10.5rem] text-sm lg:h-[10.5rem]"
    >
      <div className="flex h-[10.5rem] flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
        <div className="flex shrink-0 items-center gap-2 border-b px-2.5 py-1.5">
          <Avatar className="size-7 shrink-0">
            <AvatarFallback className="text-[10px] font-medium">
              {initialsOf(UNC.name)}
            </AvatarFallback>
          </Avatar>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate leading-tight font-semibold">
              {UNC.name}
            </span>
            <span className="truncate text-xs text-muted-foreground">
              {UNC.about}
            </span>
          </span>
          <Badge variant="secondary">
            <LockKeyhole aria-hidden />
            encrypted chat
          </Badge>
        </div>
        {/* Anchored at the bottom: older lines go up and out of the top. */}
        <ol className="flex min-h-0 flex-1 flex-col justify-end overflow-hidden px-2.5 pb-1.5 [mask-image:linear-gradient(to_bottom,transparent,black_1rem)]">
          {LINES.slice(0, shown).map((line, i) => {
            const mine = line.from === "you";
            const run = LINES[i - 1]?.from === line.from;
            return (
              <li
                key={i}
                className={cn(
                  "flex shrink-0",
                  run ? "mt-0.5" : "mt-1.5",
                  mine ? "justify-end" : "justify-start",
                )}
              >
                <span
                  className={cn(
                    "max-w-[85%] animate-[leaf-settle_300ms_ease-out_both] rounded-2xl px-2.5 py-1 text-xs",
                    mine
                      ? "origin-bottom-right bg-primary text-primary-foreground"
                      : "origin-bottom-left bg-muted text-foreground",
                  )}
                >
                  {line.text}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex shrink-0 items-center gap-1.5 border-t p-1.5">
          <span
            className={cn(
              "flex h-7 min-w-0 flex-1 items-center truncate rounded-2xl border border-input bg-transparent px-2.5 text-xs",
              draft ? "text-foreground" : "text-muted-foreground",
              draft && "border-ring ring-2 ring-ring/50",
            )}
          >
            {draft || "Message"}
          </span>
          {ended && !reduced ? (
            <WatchAgain onClick={replay} className="shrink-0" />
          ) : (
            <Button
              type="button"
              size="icon-sm"
              tabIndex={-1}
              aria-hidden
              className={cn(
                "shrink-0 rounded-full",
                pressing && "translate-y-px opacity-80",
              )}
            >
              <SendHorizontal />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
