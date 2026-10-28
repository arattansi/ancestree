"use client";

import * as React from "react";
import Link from "next/link";
import { Plus } from "lucide-react";

import { CarryPicker } from "@/components/carry-picker";
import { FamilyPersonChip } from "@/components/first-tree/family-person-chip";
import { QuickRelativeDialog } from "@/components/first-tree/quick-relative-dialog";
import { LinkPendingLabel } from "@/components/link-pending";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CloseKind, FamilyCard } from "@/lib/first-tree";
import type { BringChoices } from "@/lib/first-tree.server";
import { cn } from "@/lib/utils";

/**
 * The founder's close family, laid out the way the tree will hold them
 * (Step 29): parents above, partners and siblings either side, children
 * below. Each empty place is a button that adds someone there, drawing the
 * lines for them (`QuickRelativeDialog`). A sibling can come before any
 * parent (Step 125). A member who founded the tree first gets to bring family already
 * on their other trees, a whole line of it if they like (Step 80), rather
 * than add them twice.
 *
 * The founder is in the middle, and goes in first (Step 161): until their
 * own entry is on the tree, the middle place is `addYourself` and every
 * other place waits, locked.
 */
export function FamilyStep({
  treeId,
  treeName,
  founder,
  addYourself,
  family,
  bring,
  doneHref,
}: {
  treeId: string;
  /** For the message a relative's own link goes with (Step 214). */
  treeName: string;
  /** Their own entry, wherever it is; `null` until they've made one. */
  founder: (FamilyCard & { lastName: string; placedHere: boolean }) | null;
  /** The middle place until they're on this tree: the short form for their
   *  own entry, or bringing it across from another tree. */
  addYourself: React.ReactNode;
  family: {
    parents: FamilyCard[];
    partners: (FamilyCard & { isDivorced: boolean })[];
    children: FamilyCard[];
    siblings: (FamilyCard & { parentless: boolean })[];
  };
  bring: BringChoices | null;
  doneHref: string;
}) {
  const [adding, setAdding] = React.useState<CloseKind | null>(null);
  // Kept while the dialog animates closed, so its title doesn't change.
  const [kind, setKind] = React.useState<CloseKind>("parent");
  const add = (k: CloseKind) => {
    setKind(k);
    setAdding(k);
  };
  const placed = !!founder?.placedHere;
  const anyone =
    family.parents.length +
      family.partners.length +
      family.children.length +
      family.siblings.length >
    0;

  return (
    <div className="flex flex-col gap-6">
      {bring ? (
        <Card>
          <CardHeader>
            <CardTitle>Already on {listNames(bring.fromTrees)}</CardTitle>
            <CardDescription>
              Bring them across instead of adding them again.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CarryPicker
              treeId={treeId}
              people={bring.people}
              lines={bring.lines}
              suggested={bring.close}
            />
          </CardContent>
        </Card>
      ) : null}

      <section
        aria-label="Your family so far"
        className="flex flex-col items-center gap-3 rounded-xl border border-border bg-muted/30 px-3 py-6 sm:px-6"
      >
        <Group label="Parents">
          {family.parents.map((p) => (
            <li key={p.id}>
              <FamilyPersonChip person={p} />
            </li>
          ))}
          {family.parents.length < 2 ? (
            <li>
              <Slot locked={!placed} onClick={() => add("parent")}>
                Add a parent
              </Slot>
            </li>
          ) : null}
        </Group>

        <Stem />

        <div className="grid w-full items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
          {placed && founder ? (
            <Group label="You" className="sm:order-2">
              <li>
                <FamilyPersonChip person={founder} highlight />
              </li>
            </Group>
          ) : (
            <YouFirst>{addYourself}</YouFirst>
          )}
          <Group label="Partners" align="start" className="sm:order-3">
            {family.partners.map((p) => (
              <li key={p.id}>
                <FamilyPersonChip
                  person={p}
                  note={p.isDivorced ? "Former partner" : undefined}
                />
              </li>
            ))}
            <li>
              <Slot locked={!placed} onClick={() => add("partner")}>
                {family.partners.length > 0 ? "Add another partner" : "Add a partner"}
              </Slot>
            </li>
          </Group>
          <Group label="Siblings" align="end" className="sm:order-1">
            {family.siblings.map((p) => (
              <li key={p.id}>
                <FamilyPersonChip person={p} />
              </li>
            ))}
            <li>
              <Slot locked={!placed} onClick={() => add("sibling")}>
                Add a sibling
              </Slot>
            </li>
          </Group>
        </div>

        <Stem />

        <Group label="Children">
          {family.children.map((p) => (
            <li key={p.id}>
              <FamilyPersonChip person={p} />
            </li>
          ))}
          <li>
            <Slot locked={!placed} onClick={() => add("child")}>
              Add a child
            </Slot>
          </li>
        </Group>
      </section>

      {/* Your own entry is the one thing the tree can't do without. */}
      {placed ? (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            nativeButton={false}
            render={<Link href={doneHref} />}
            variant={anyone ? "default" : "outline"}
          >
            <LinkPendingLabel>{anyone ? "continue" : "skip for now"}</LinkPendingLabel>
          </Button>
          <p className="text-xs text-muted-foreground">
            Add everyone else from the tree.
          </p>
        </div>
      ) : null}

      {placed && founder ? (
        <QuickRelativeDialog
          open={adding !== null}
          onOpenChange={(open) => {
            if (!open) setAdding(null);
          }}
          kind={adding ?? kind}
          treeId={treeId}
          treeName={treeName}
          founder={{ id: founder.id, lastName: founder.lastName }}
        parents={family.parents.map((p) => ({ id: p.id, name: p.name }))}
        parentlessSiblings={family.siblings
          .filter((p) => p.parentless)
          .map((p) => ({ id: p.id, name: p.name }))}
          partners={family.partners.map((p) => ({
            id: p.id,
            name: p.name,
            isDivorced: p.isDivorced,
          }))}
        />
      ) : null}
    </div>
  );
}

/** The middle place before the founder is on the tree: where they start. */
function YouFirst({ children }: { children: React.ReactNode }) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className="flex w-full flex-col items-center gap-2 sm:order-2 sm:w-[22rem]"
    >
      <h2 id={id} className="text-xs font-medium text-muted-foreground">
        You
      </h2>
      <div className="w-full rounded-xl border border-account-root/50 bg-card p-4 text-left shadow-xs ring-2 ring-account-root/20">
        {children}
      </div>
    </section>
  );
}

function Group({
  label,
  align = "center",
  className,
  children,
}: {
  label: string;
  /** Which way the group hugs the founder from `sm` up. */
  align?: "start" | "center" | "end";
  className?: string;
  children: React.ReactNode;
}) {
  const id = React.useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "flex flex-col items-center gap-2",
        align === "start" && "sm:items-start",
        align === "end" && "sm:items-end",
        className,
      )}
    >
      <h2 id={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </h2>
      <ul
        className={cn(
          "flex flex-wrap justify-center gap-2",
          align === "start" && "sm:flex-col sm:items-start",
          align === "end" && "sm:flex-col sm:items-end",
        )}
      >
        {children}
      </ul>
    </section>
  );
}

function Slot({
  onClick,
  locked = false,
  children,
}: {
  onClick: () => void;
  /** Waiting on the founder's own entry (Step 161): narrower, so their
   *  form has the middle, and not yet a button that does anything. */
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={locked}
      className={cn(
        "flex h-[3.25rem] items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background/60 text-sm text-muted-foreground transition-colors outline-none hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        locked
          ? "w-36 opacity-50 hover:border-border hover:text-muted-foreground"
          : "w-44",
      )}
    >
      {locked ? null : <Plus aria-hidden className="size-4" />}
      {children}
      {locked ? (
        <span className="sr-only">, once you&rsquo;ve added yourself</span>
      ) : null}
    </button>
  );
}

function Stem() {
  return <div aria-hidden className="h-5 w-px bg-border" />;
}

function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
