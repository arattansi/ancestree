"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { ImpliedConnection } from "@/lib/connection-suggestions";

export type SuggestionResolution = "accepted" | "dismissed" | "pending";

export type SuggestionPrompt = {
  suggestion: ImpliedConnection;
  /** Plain-language question, already filled in with names by the caller. */
  question: string;
  /** Label for the affirmative choice — defaults to "Yes". */
  yesLabel?: string;
};

const CHOICES: {
  value: SuggestionResolution;
  label: (yes: string) => string;
  hint: string;
}[] = [
  { value: "accepted", label: (yes) => yes, hint: "" },
  { value: "dismissed", label: () => "No", hint: "" },
  {
    value: "pending",
    label: () => "Skip for now",
    hint: "We'll ask again on their entry.",
  },
];

/**
 * Blocking approval modal (Step 11.3). The entry can't save until every implied
 * connection is answered Yes / No / Skip. Not dismissible by outside-click or
 * Esc — the only ways out are "Cancel" (back to the form) or answering them all.
 */
export function ConnectionApprovalDialog({
  open,
  prompts,
  busy,
  onCancel,
  onResolve,
}: {
  open: boolean;
  prompts: SuggestionPrompt[];
  busy?: boolean;
  onCancel: () => void;
  onResolve: (resolutions: SuggestionResolution[]) => void;
}) {
  const [choices, setChoices] = React.useState<(SuggestionResolution | null)[]>(
    () => prompts.map(() => null),
  );
  const [seenPrompts, setSeenPrompts] = React.useState(prompts);
  if (seenPrompts !== prompts) {
    setSeenPrompts(prompts);
    setChoices(prompts.map(() => null));
  }

  const allAnswered =
    choices.length === prompts.length && choices.every((c) => c !== null);

  return (
    <Dialog open={open} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[85dvh] overflow-y-auto sm:max-w-md"
      >
        <DialogHeader>
          <DialogTitle>A few connections to check</DialogTitle>
          <DialogDescription>
            Adding this person suggests some links we&apos;re not sure about.
            Answer each one to save the entry.
          </DialogDescription>
        </DialogHeader>

        <ul className="flex flex-col gap-4">
          {prompts.map((p, i) => (
            <li
              key={i}
              className="flex flex-col gap-2.5 rounded-lg border border-border p-3"
            >
              <p className="text-sm font-medium text-foreground">{p.question}</p>
              <div
                role="radiogroup"
                aria-label={p.question}
                className="flex flex-wrap gap-2"
              >
                {CHOICES.map((choice) => {
                  const selected = choices[i] === choice.value;
                  return (
                    <Button
                      key={choice.value}
                      type="button"
                      size="sm"
                      variant={selected ? "default" : "outline"}
                      role="radio"
                      aria-checked={selected}
                      disabled={busy}
                      onClick={() =>
                        setChoices((prev) => {
                          const next = [...prev];
                          next[i] = choice.value;
                          return next;
                        })
                      }
                      className={cn(!selected && "text-muted-foreground")}
                    >
                      {choice.label(p.yesLabel ?? "Yes")}
                    </Button>
                  );
                })}
              </div>
              {choices[i] === "pending" ? (
                <p className="text-xs text-muted-foreground">
                  We&apos;ll ask again on their entry.
                </p>
              ) : null}
            </li>
          ))}
        </ul>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={onCancel}
          >
            Back to form
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || !allAnswered}
            onClick={() =>
              onResolve(choices.filter((c): c is SuggestionResolution => c !== null))
            }
          >
            {busy ? "Saving…" : "Save entry"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
