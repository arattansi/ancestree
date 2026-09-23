"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { placePeople } from "@/app/actions/trees";
import { FamilyPersonChip } from "@/components/first-tree/family-person-chip";
import { QuickRelativeDialog } from "@/components/first-tree/quick-relative-dialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import type { CloseKind, FamilyCard } from "@/lib/first-tree";
import { cn } from "@/lib/utils";

export type BringOption = {
  id: string;
  name: string;
  lifespan: string | null;
  fromTrees: string[];
  needsConsent: boolean;
  kind: CloseKind;
};

const KIND_WORD: Record<CloseKind, string> = {
  parent: "Your parent",
  partner: "Your partner",
  child: "Your child",
  sibling: "Your sibling",
};

/**
 * The founder's close family, laid out the way the tree will hold them
 * (Step 29): parents above, partners and siblings either side, children
 * below. Each empty place is a button that adds someone there, drawing the
 * lines for them (`QuickRelativeDialog`). A sibling waits for a parent to
 * share. A member who founded the tree first gets to bring the close family
 * already on their other trees, rather than add them twice.
 */
export function FamilyStep({
  treeId,
  founder,
  family,
  bring,
  waiting,
  doneHref,
}: {
  treeId: string;
  founder: FamilyCard & { lastName: string };
  family: {
    parents: FamilyCard[];
    partners: (FamilyCard & { isDivorced: boolean })[];
    children: FamilyCard[];
    siblings: FamilyCard[];
  };
  bring: BringOption[];
  waiting: { personId: string; name: string }[];
  doneHref: string;
}) {
  const [adding, setAdding] = React.useState<CloseKind | null>(null);
  // Kept while the dialog animates closed, so its title doesn't change.
  const [kind, setKind] = React.useState<CloseKind>("parent");
  const add = (k: CloseKind) => {
    setKind(k);
    setAdding(k);
  };
  const siblingHint = React.useId();

  return (
    <div className="flex flex-col gap-6">
      {bring.length > 0 ? <BringRelatives treeId={treeId} options={bring} /> : null}
      {waiting.length > 0 ? (
        <p className="text-sm text-muted-foreground">
          Waiting for {listNames(waiting.map((w) => w.name))} to say yes —
          they&rsquo;ll appear here once they do.
        </p>
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
              <Slot onClick={() => add("parent")}>Add a parent</Slot>
            </li>
          ) : null}
        </Group>

        <Stem />

        <div className="grid w-full items-start gap-4 sm:grid-cols-[1fr_auto_1fr]">
          <Group label="You" className="sm:order-2">
            <li>
              <FamilyPersonChip person={founder} highlight />
            </li>
          </Group>
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
              <Slot onClick={() => add("partner")}>
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
            <li className="flex flex-col items-center gap-1 sm:items-end">
              <Slot
                onClick={() => add("sibling")}
                disabled={family.parents.length === 0}
                describedBy={family.parents.length === 0 ? siblingHint : undefined}
              >
                Add a sibling
              </Slot>
              {family.parents.length === 0 ? (
                <p
                  id={siblingHint}
                  className="max-w-44 text-center text-xs text-muted-foreground sm:text-right"
                >
                  Add a parent first, so siblings sit together under them.
                </p>
              ) : null}
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
            <Slot onClick={() => add("child")}>Add a child</Slot>
          </li>
        </Group>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <Button nativeButton={false} render={<Link href={doneHref} />}>
          Done — open my tree
        </Button>
        <p className="text-xs text-muted-foreground">
          Grandparents, cousins and everyone else you can add from the tree.
        </p>
      </div>

      <QuickRelativeDialog
        open={adding !== null}
        onOpenChange={(open) => {
          if (!open) setAdding(null);
        }}
        kind={adding ?? kind}
        treeId={treeId}
        founder={{ id: founder.id, lastName: founder.lastName }}
        parents={family.parents.map((p) => ({ id: p.id, name: p.name }))}
        partners={family.partners.map((p) => ({
          id: p.id,
          name: p.name,
          isDivorced: p.isDivorced,
        }))}
      />
    </div>
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
  disabled = false,
  describedBy,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  describedBy?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-describedby={describedBy}
      className="flex h-[3.25rem] w-44 items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-background/60 text-sm text-muted-foreground transition-colors outline-none hover:border-ring hover:text-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:border-border disabled:hover:text-muted-foreground"
    >
      <Plus aria-hidden className="size-4" />
      {children}
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

/**
 * For a member who founded the tree: their close family already on their
 * other trees, ticked, to bring across as they are. Someone who is a member
 * themselves is asked first, as any placement of a member's own entry is.
 */
function BringRelatives({
  treeId,
  options,
}: {
  treeId: string;
  options: BringOption[];
}) {
  const router = useRouter();
  const [unticked, setUnticked] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const picked = options.filter((o) => !unticked.has(o.id));
  const from = [...new Set(options.flatMap((o) => o.fromTrees))];

  async function onBring() {
    if (picked.length === 0) return;
    setBusy(true);
    const res = await placePeople(
      treeId,
      picked.map((o) => o.id),
    );
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    const placed = res.placed ?? [];
    const asked = placed.filter((p) => p.status === "pending").length;
    const shown = placed.length - asked;
    toast.success(
      [
        shown > 0 ? `${shown} brought across` : null,
        asked > 0 ? `${asked} asked first` : null,
      ]
        .filter(Boolean)
        .join(", ") + ".",
    );
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Already on {listNames(from)}</CardTitle>
        <CardDescription>
          Bring them across rather than adding them again: they keep their one
          entry. Anyone who&rsquo;s a member is asked first.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2">
          {options.map((option) => (
            <li key={option.id}>
              <label className="flex items-start gap-3 rounded-md border border-border p-2.5 text-sm">
                <Checkbox
                  id={`bring-${option.id}`}
                  checked={!unticked.has(option.id)}
                  onCheckedChange={(c) =>
                    setUnticked((prev) => {
                      const next = new Set(prev);
                      if (c === true) next.delete(option.id);
                      else next.add(option.id);
                      return next;
                    })
                  }
                  className="mt-0.5"
                />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium text-foreground">{option.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {KIND_WORD[option.kind]}
                    {option.lifespan ? ` · ${option.lifespan}` : ""}
                    {option.needsConsent ? " · asked first" : ""}
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        <Button
          onClick={onBring}
          disabled={busy || picked.length === 0}
          className="self-start"
        >
          {busy
            ? "Bringing them across…"
            : picked.length === 1
              ? "Bring them across"
              : `Bring ${picked.length} across`}
        </Button>
      </CardContent>
    </Card>
  );
}
