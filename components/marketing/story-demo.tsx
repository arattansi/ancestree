"use client";

import * as React from "react";
import { Mic, Play } from "lucide-react";

import { typeOut, useSamplePlay } from "@/components/marketing/demo-play";
import { WatchAgain } from "@/components/marketing/watch-again";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The /features "stories & albums" sample (Step 115), kept no taller than
 * the words beside it: add a story's "Upload a recording" filling itself
 * in (a title, a description saying what the recording is about, the
 * recording, Rumi as storyteller and André as interviewer, Step 99), then
 * the story as Rumi's stories show it, waiting for her approval since her
 * leaf is claimed. It plays once, then offers **watch again**. A picture
 * that moves: the recording is a stand-in, and nothing plays.
 */

const SAMPLE = {
  title: "Leaving Balkh",
  description:
    "Rumi on the winter her family left Balkh, the long walk west, and how they ended up in Konya.",
  storyteller: "Rumi Baldwin",
  interviewer: "André Franklin",
};
const LENGTH = "12:48";

type Draft = {
  title: string;
  description: string;
  /** Not picked, being prepared (percent), or ready. */
  recording: "none" | number | "ready";
  storyteller: boolean;
  interviewer: boolean;
};

const EMPTY: Draft = {
  title: "",
  description: "",
  recording: "none",
  storyteller: false,
  interviewer: false,
};
const DONE: Draft = {
  ...SAMPLE,
  recording: "ready",
  storyteller: true,
  interviewer: true,
};

/** A field drawn as the app's inputs are, small. */
const FIELD =
  "min-w-0 rounded-md border border-input bg-background px-2 text-xs dark:bg-input/30";
const FILLING = "border-ring ring-2 ring-ring/50";

type Typing = "title" | "description";

export function StoryDemo() {
  const [told, setTold] = React.useState(false);
  const [draft, setDraft] = React.useState<Draft>(EMPTY);
  const [typing, setTyping] = React.useState<Typing | null>(null);
  const [pressing, setPressing] = React.useState(false);
  const box = React.useRef<HTMLDivElement>(null);
  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const { reduced, ended, replay } = useSamplePlay(
    box,
    async (wait) => {
      setTyping("title");
      await typeOut(SAMPLE.title, (title) => set({ title }), wait, 70);
      setTyping("description");
      await typeOut(
        SAMPLE.description,
        (description) => set({ description }),
        wait,
        22,
      );
      setTyping(null);
      await wait(300);
      for (let n = 0; n <= 100; n += 10) {
        set({ recording: n });
        await wait(70);
      }
      set({ recording: "ready" });
      await wait(500);
      set({ storyteller: true });
      await wait(500);
      set({ interviewer: true });
      await wait(600);
      setPressing(true);
      await wait(180);
      setPressing(false);
      setTold(true);
    },
    () => {
      setTold(false);
      setDraft(EMPTY);
      setTyping(null);
      setPressing(false);
    },
  );
  const shown = reduced ? DONE : draft;

  return (
    <div
      ref={box}
      role="group"
      aria-label="A recorded story added to Rumi Baldwin’s leaf, with a title, a description, its storyteller and its interviewer"
      className="min-h-[10.5rem] text-sm lg:h-[10.5rem]"
    >
      <div
        key={reduced || told ? "told" : "form"}
        className="flex min-h-[10.5rem] animate-[leaf-settle_300ms_ease-out_both] flex-col gap-1.5 rounded-xl lg:h-full lg:overflow-hidden border bg-card p-3 shadow-sm"
      >
        {reduced || told ? (
          <Told again={ended && !reduced ? replay : null} />
        ) : (
          <>
            <p className="font-medium">Upload a recording</p>
            <div className="grid flex-1 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 text-xs">
              <span className="font-medium">Title</span>
              <span
                className={cn(
                  FIELD,
                  "flex h-6 items-center",
                  typing === "title" && FILLING,
                )}
              >
                {shown.title}
              </span>
              <span className="self-start pt-0.5 font-medium">Description</span>
              <span
                className={cn(
                  FIELD,
                  "line-clamp-2 h-[2.4rem] py-0.5 leading-4",
                  typing === "description" && FILLING,
                )}
              >
                {shown.description}
              </span>
              <span className="font-medium">Recording</span>
              <Recording recording={shown.recording} />
              <span className="font-medium">Storyteller</span>
              <span className="flex h-5 min-w-0 items-center gap-1.5">
                {shown.storyteller ? (
                  <Credit name={SAMPLE.storyteller} />
                ) : null}
                <span className="ml-1 font-medium">Interviewer</span>
                {shown.interviewer ? (
                  <Credit name={SAMPLE.interviewer} />
                ) : null}
                <Button
                  type="button"
                  size="xs"
                  tabIndex={-1}
                  aria-hidden
                  className={cn(
                    "ml-auto",
                    pressing && "translate-y-px opacity-80",
                  )}
                >
                  add
                </Button>
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Credit({ name }: { name: string }) {
  return (
    <span
      className={cn(
        badgeVariants({ variant: "outline" }),
        "animate-[leaf-settle_300ms_ease-out_both] truncate",
      )}
    >
      {name}
    </span>
  );
}

function Recording({ recording }: { recording: Draft["recording"] }) {
  if (recording === "ready")
    return (
      <span className="flex min-w-0 items-center gap-2">
        <Player />
      </span>
    );
  return (
    <span className="flex h-6 items-center gap-1.5 text-muted-foreground">
      <Mic aria-hidden className="size-3" />
      {typeof recording === "number"
        ? `preparing… ${recording}%`
        : "choose a recording"}
    </span>
  );
}

/** Bar heights for the stand-in recording's waveform, out of 10. */
const WAVE = [
  3, 5, 8, 6, 9, 4, 7, 10, 6, 3, 5, 8, 7, 4, 6, 9, 5, 3, 7, 8, 6, 4,
];

/** A recording's player, drawn: there's nothing to play. */
function Player() {
  return (
    <span className="flex h-6 w-full min-w-0 items-center gap-2 rounded-full bg-muted px-1.5">
      <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-foreground text-background">
        <Play className="size-2 fill-current" />
      </span>
      <span className="flex h-3.5 flex-1 items-center gap-[2px] overflow-hidden">
        {WAVE.map((h, i) => (
          <span
            key={i}
            className="w-[2px] shrink-0 rounded-full bg-muted-foreground/60"
            style={{ height: `${h * 10}%` }}
          />
        ))}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        {LENGTH}
      </span>
    </span>
  );
}

/** The story as Rumi's stories show it (`entry-stories.tsx`), small. */
function Told({ again }: { again: (() => void) | null }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-medium">{SAMPLE.title}</p>
        <Badge variant="secondary">Waiting for approval</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
        <span>Rumi Baldwin’s stories</span>
        <span>
          Added by <span className="font-medium text-foreground">you</span>
        </span>
        <span className="flex items-center gap-1">
          <Mic aria-hidden className="size-3" />
          {LENGTH}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          Storyteller
          <span className={badgeVariants({ variant: "outline" })}>
            {SAMPLE.storyteller}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          Interviewer
          <span className={badgeVariants({ variant: "outline" })}>
            {SAMPLE.interviewer}
          </span>
        </span>
      </div>
      <p className="line-clamp-2 text-xs">{SAMPLE.description}</p>
      <div className="flex items-center gap-2">
        <Player />
        {again ? <WatchAgain onClick={again} className="shrink-0" /> : null}
      </div>
    </>
  );
}
