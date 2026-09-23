import Link from "next/link";
import { Check } from "lucide-react";

import {
  FIRST_TREE_STEPS,
  FIRST_TREE_STEP_NAMES,
  reachableStep,
  stepDone,
  type FirstTreeState,
  type FirstTreeStep,
} from "@/lib/first-tree";
import { onboardingStepHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";

/**
 * Where a founder is in their first run (Step 29): the four steps, each a
 * link back to it, ticked once its work is on the tree. Naming the tree and
 * adding family build on the founder's own entry, so until it's there they
 * aren't links yet. On a phone only the current step keeps its name.
 */
export function FirstTreeProgress({
  current,
  state,
}: {
  current: FirstTreeStep;
  state: FirstTreeState;
}) {
  return (
    <nav aria-label="Starting your tree">
      <ol className="flex flex-wrap items-center gap-1.5 text-sm sm:gap-2">
        {FIRST_TREE_STEPS.map((step, i) => {
          const isCurrent = step === current;
          const done = stepDone(step, state);
          const reachable = reachableStep(step, state) === step;
          const body = (
            <>
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border text-xs font-medium",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : done
                      ? "border-canopy/40 bg-canopy/10 text-canopy"
                      : "border-border text-muted-foreground",
                )}
              >
                {done && !isCurrent ? (
                  <Check aria-hidden className="size-3.5" />
                ) : (
                  i + 1
                )}
              </span>
              <span
                className={cn(
                  isCurrent
                    ? "font-medium text-foreground"
                    : "text-muted-foreground max-sm:sr-only",
                )}
              >
                {FIRST_TREE_STEP_NAMES[step]}
              </span>
              {done ? <span className="sr-only">, done</span> : null}
            </>
          );
          return (
            <li key={step} className="flex items-center gap-1.5 sm:gap-2">
              {i > 0 ? (
                <span aria-hidden className="h-px w-3 bg-border sm:w-6" />
              ) : null}
              {reachable && !isCurrent ? (
                <Link
                  href={onboardingStepHref(step)}
                  className="flex items-center gap-1.5 rounded-md px-1 py-0.5 hover:bg-muted"
                >
                  {body}
                </Link>
              ) : (
                <span
                  aria-current={isCurrent ? "step" : undefined}
                  className="flex items-center gap-1.5 px-1 py-0.5"
                >
                  {body}
                  {isCurrent ? null : (
                    <span className="sr-only">, once you&rsquo;ve added yourself</span>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
