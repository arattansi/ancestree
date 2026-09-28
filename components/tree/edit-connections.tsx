"use client";

import * as React from "react";

import { connectExistingPeople, removeRelationship } from "@/app/actions/people";
import { CoParentOffer } from "@/components/co-parent-offer";
import { ConfirmButton } from "@/components/confirm-dialog";
import { DateField } from "@/components/date-field";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { UNREACHABLE } from "@/lib/action-feedback";
import {
  coParentSelection,
  KIND_STATEMENT,
  type PartnerOption,
} from "@/lib/connections";
import { marriageDateProblems, toStoredDate } from "@/lib/partial-date";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
/** How the edited person relates to the other person. */
export type ConnectionKind = "parent" | "child" | "spouse" | "sibling";

export type Partner = PartnerOption;

const KINDS: ConnectionKind[] = ["child", "parent", "spouse", "sibling"];

const KIND_LABEL: Record<ConnectionKind, string> = {
  parent: "Parent of",
  child: "Child of",
  spouse: "Spouse / partner of",
  sibling: "Sibling of",
};

/** One of the person's current parent / child / spouse / sibling links. */
export type ExistingConnection = {
  id: string;
  otherName: string;
  /** How the *edited* person relates to `otherName`. */
  kind: ConnectionKind;
  canRemove: boolean;
  /**
   * A spouse line's dates, which go with it when it's removed, so the
   * question says so first (Step 70). Left out, it says nothing of them.
   */
  hasMarriageDate?: boolean;
  hasDivorceDate?: boolean;
};

/** What removing a line loses besides the line, said before it goes. */
function removalNote(c: ExistingConnection): string | undefined {
  if (c.kind !== "spouse") return undefined;
  const dates =
    c.hasMarriageDate && c.hasDivorceDate
      ? "Their marriage and divorce dates go with it."
      : c.hasMarriageDate
        ? "Their marriage date goes with it."
        : c.hasDivorceDate
          ? "Their divorce date goes with it."
          : null;
  return dates ? `${dates}\nThis cannot be undone.` : undefined;
}

export function EditConnections({
  treeId,
  personId,
  personName,
  personPartners,
  members,
  connections,
}: {
  /** The tree the new line is drawn on (Step 25). */
  treeId: string;
  personId: string;
  personName: string;
  /** The edited person's own partners — the co-parents on offer when they are
   *  the parent in the new link. */
  personPartners: Partner[];
  members: TreeMemberOption[];
  connections: ExistingConnection[];
}) {
  const [otherId, setOtherId] = React.useState("");
  const [kind, setKind] = React.useState<ConnectionKind>("child");
  /** null until the member touches it — see `defaultCoParents`. */
  const [coParentIds, setCoParentIds] = React.useState<string[] | null>(null);
  const [marriageDate, setMarriageDate] = React.useState("");
  const [isDivorced, setIsDivorced] = React.useState(false);
  const [divorceDate, setDivorceDate] = React.useState("");
  const add = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const addRef = React.useRef<HTMLDivElement>(null);

  const otherMember = members.find((m) => m.id === otherId);
  const otherLabel = otherMember?.label ?? "the other person";

  // Whose partners are on offer depends on which side of the new parent edge
  // the parent is on: "X is a child of Y" makes Y the parent, "X is a parent
  // of Y" makes X one.
  const parentSide =
    kind === "child"
      ? { partners: otherMember?.partners ?? [], childId: personId }
      : kind === "parent"
        ? { partners: personPartners, childId: otherId }
        : null;
  const coParentOffer = parentSide?.partners ?? [];
  const chosenCoParents = coParentSelection(coParentIds, coParentOffer);

  function resetForm() {
    setOtherId("");
    setKind("child");
    setMarriageDate("");
    setIsDivorced(false);
    setDivorceDate("");
    setCoParentIds(null);
  }

  // Marriage dates have to be whole (no precision column on relationships),
  // or a day and month without the year (Step 63).
  const dateProblems =
    kind === "spouse"
      ? marriageDateProblems({ marriageDate, isDivorced, divorceDate })
      : { marriage: null, divorce: null };
  const datesOk = !dateProblems.marriage && !dateProblems.divorce;

  function onAdd() {
    if (!otherId) {
      add.setError("Pick someone already in the tree.");
      return;
    }
    if (!datesOk) return;
    // Padded to ISO: a one-digit day types as "1965-03-5".
    const married = toStoredDate(marriageDate);
    const partnersToAdd = parentSide ? chosenCoParents : [];
    const childId = parentSide?.childId ?? "";
    add.run(
      "add",
      async (): Promise<{
        error?: string;
        alsoAdded?: string[];
        missed?: string;
      }> => {
        const res = await connectExistingPeople({
          treeId,
          personId,
          otherId,
          kind,
          marriage_date: married.date ?? "",
          marriage_month: married.withoutYear?.month ?? null,
          marriage_day: married.withoutYear?.day ?? null,
          is_divorced: isDivorced,
          divorce_date: toStoredDate(divorceDate).date ?? "",
        });
        if (res.error) return res;
        // The main edge is in. Each ticked partner becomes a parent of the
        // same child — one call apiece, because `connect_people` writes one
        // edge.
        const alsoAdded: string[] = [];
        for (const coParentId of partnersToAdd) {
          const label = coParentOffer.find((p) => p.id === coParentId)?.label;
          let refused: string | undefined;
          try {
            const extra = await connectExistingPeople({
              treeId,
              personId: coParentId,
              otherId: childId,
              kind: "parent",
            });
            refused = extra.error;
          } catch {
            refused = UNREACHABLE;
          }
          if (refused) {
            // The main link is saved either way, so the form isn't handed
            // back to be pressed again: say what didn't happen.
            return {
              alsoAdded,
              missed: `Connected, but couldn't also add ${
                label ?? "the other parent"
              }: ${refused}`,
            };
          }
          alsoAdded.push(label ?? "another parent");
        }
        return { alsoAdded };
      },
      {
        // Only the partners: the new line itself shows in the list above.
        success: ({ alsoAdded = [], missed }) =>
          alsoAdded.length > 0 && !missed
            ? `Connection added, with ${alsoAdded.join(" & ")} as a parent too.`
            : null,
        onSuccess: ({ missed }) => {
          resetForm();
          if (missed) add.setError(missed);
          // The Add button goes with the form: the search for the next
          // person takes focus.
          returnFocus(() =>
            addRef.current?.querySelector<HTMLElement>(
              'input[type="search"]',
            ),
          );
        },
      },
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border p-4">
      <div>
        <h2 className="text-base font-semibold">Connections</h2>
        <p className="text-sm text-muted-foreground">
          Link {personName} to other people already on the tree — the same way
          you connect a relative when you first add them.
        </p>
      </div>

      {connections.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {connections.map((c) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-sm"
            >
              <span className="text-xs font-medium text-muted-foreground">
                {KIND_LABEL[c.kind]}
              </span>
              <span className="flex-1 text-foreground">{c.otherName}</span>
              {c.canRemove ? (
                <ConfirmButton
                  variant="link"
                  aria-label={`Remove the connection to ${c.otherName}`}
                  className="relative tap-target h-auto p-0 text-xs font-normal text-destructive underline underline-offset-2"
                  confirm={{
                    title: `Remove the connection to ${c.otherName}?`,
                    description: removalNote(c),
                    confirmLabel: "Remove",
                    pendingLabel: "Removing…",
                    onConfirm: () => removeRelationship(c.id),
                  }}
                >
                  Remove
                </ConfirmButton>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No connections yet.</p>
      )}

      <div
        ref={addRef}
        className="flex flex-col gap-3 border-t border-border pt-4"
      >
        <p className="text-sm font-medium">Add a connection</p>

        <RelationshipPicker
          members={members}
          value={otherId}
          onChange={(id) => {
            setOtherId(id);
            // Someone else picked: what went wrong before was about the last.
            add.setError(null);
          }}
        />

        {otherId ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{personName}</span>
              <Select
                items={KIND_STATEMENT}
                value={kind}
                onValueChange={(v) => setKind(v as ConnectionKind)}
              >
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {KIND_STATEMENT[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-medium">{otherLabel}</span>
            </div>

            <CoParentOffer
              idBase="conn"
              partners={coParentOffer}
              chosen={coParentIds}
              parentLabel={kind === "child" ? otherLabel : personName}
              onChange={setCoParentIds}
            />

            {kind === "spouse" ? (
              <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="conn-marriage" className="text-xs font-normal">
                    Marriage date (optional)
                  </Label>
                  <DateField
                    id="conn-marriage"
                    value={marriageDate}
                    onChange={setMarriageDate}
                    aria-invalid={Boolean(dateProblems.marriage)}
                  />
                  {dateProblems.marriage ? (
                    <p className="text-xs text-destructive">
                      {dateProblems.marriage}
                    </p>
                  ) : null}
                </div>
                <label className="flex items-center gap-3 text-sm">
                  <Checkbox
                    id="conn-divorced"
                    checked={isDivorced}
                    onCheckedChange={(c) => setIsDivorced(c === true)}
                  />
                  <span>They later divorced</span>
                </label>
                {isDivorced ? (
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="conn-divorce" className="text-xs font-normal">
                      Divorce date (optional)
                    </Label>
                    <DateField
                      id="conn-divorce"
                      value={divorceDate}
                      onChange={setDivorceDate}
                      aria-invalid={Boolean(dateProblems.divorce)}
                    />
                    {dateProblems.divorce ? (
                      <p className="text-xs text-destructive">
                        {dateProblems.divorce}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}

        {/* Out here, so what didn't happen still shows once the form has
            closed up (a partner who couldn't also be added). */}
        <FormError>{add.error}</FormError>
        {otherId ? (
          <div>
            <PendingButton
              size="sm"
              onClick={onAdd}
              pending={add.pending}
              disabled={!datesOk}
              pendingLabel="Adding…"
            >
              Add connection
            </PendingButton>
          </div>
        ) : null}
      </div>
    </section>
  );
}
