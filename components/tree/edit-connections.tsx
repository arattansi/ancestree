"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { connectExistingPeople, removeRelationship } from "@/app/actions/people";
import { CoParentOffer } from "@/components/co-parent-offer";
import { DateField } from "@/components/date-field";
import { coParentSelection, type PartnerOption } from "@/lib/connections";
import { marriageDateProblems, toStoredDate } from "@/lib/partial-date";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
/** How the edited person relates to the other person. */
export type ConnectionKind = "parent" | "child" | "spouse" | "sibling";

export type Partner = PartnerOption;

const KINDS: ConnectionKind[] = ["child", "parent", "spouse", "sibling"];

const KIND_STATEMENT: Record<ConnectionKind, string> = {
  parent: "is a parent of",
  child: "is a child of",
  spouse: "is the spouse / partner of",
  sibling: "is a sibling of",
};

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
};

export function EditConnections({
  personId,
  personName,
  personPartners,
  members,
  connections,
}: {
  personId: string;
  personName: string;
  /** The edited person's own partners — the co-parents on offer when they are
   *  the parent in the new link. */
  personPartners: Partner[];
  members: TreeMemberOption[];
  connections: ExistingConnection[];
}) {
  const router = useRouter();

  const [otherId, setOtherId] = React.useState("");
  const [kind, setKind] = React.useState<ConnectionKind>("child");
  /** null until the member touches it — see `defaultCoParents`. */
  const [coParentIds, setCoParentIds] = React.useState<string[] | null>(null);
  const [marriageDate, setMarriageDate] = React.useState("");
  const [isDivorced, setIsDivorced] = React.useState(false);
  const [divorceDate, setDivorceDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

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

  // Marriage dates have to be whole (no precision column on relationships).
  const dateProblems =
    kind === "spouse"
      ? marriageDateProblems({ marriageDate, isDivorced, divorceDate })
      : { marriage: null, divorce: null };
  const datesOk = !dateProblems.marriage && !dateProblems.divorce;

  async function add() {
    if (!otherId) {
      toast.error("Pick someone already in the tree.");
      return;
    }
    if (!datesOk) return;
    setBusy(true);
    const res = await connectExistingPeople({
      personId,
      otherId,
      kind,
      // Padded to ISO: a one-digit day types as "1965-03-5".
      marriage_date: toStoredDate(marriageDate).date ?? "",
      is_divorced: isDivorced,
      divorce_date: toStoredDate(divorceDate).date ?? "",
    });
    if (res.error) {
      setBusy(false);
      toast.error(res.error);
      return;
    }
    // The main edge is in. Each ticked partner becomes a parent of the same
    // child — one call apiece, because `connect_people` writes one edge.
    const alsoAdded: string[] = [];
    for (const coParentId of parentSide ? chosenCoParents : []) {
      const extra = await connectExistingPeople({
        personId: coParentId,
        otherId: parentSide!.childId,
        kind: "parent",
      });
      if (extra.error) {
        // The main link is saved either way; say what didn't happen.
        toast.error(
          `Connected, but couldn't also add ${
            coParentOffer.find((p) => p.id === coParentId)?.label ??
            "the other parent"
          }: ${extra.error}`,
        );
        setBusy(false);
        resetForm();
        router.refresh();
        return;
      }
      alsoAdded.push(
        coParentOffer.find((p) => p.id === coParentId)?.label ?? "another parent",
      );
    }

    toast.success(
      alsoAdded.length > 0
        ? `Connection added, with ${alsoAdded.join(" & ")} as a parent too.`
        : "Connection added.",
    );
    setBusy(false);
    resetForm();
    router.refresh();
  }

  async function remove(id: string) {
    setRemovingId(id);
    const res = await removeRelationship(id);
    setRemovingId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Connection removed.");
    router.refresh();
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
                <button
                  type="button"
                  className="text-xs text-destructive underline underline-offset-2 disabled:opacity-50"
                  disabled={removingId !== null}
                  onClick={() => remove(c.id)}
                >
                  {removingId === c.id ? "Removing…" : "Remove"}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No connections yet.</p>
      )}

      <div className="flex flex-col gap-3 border-t border-border pt-4">
        <p className="text-sm font-medium">Add a connection</p>

        <RelationshipPicker
          members={members}
          value={otherId}
          onChange={setOtherId}
        />

        {otherId ? (
          <>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="font-medium">{personName}</span>
              <Select
                value={kind}
                onValueChange={(v) => setKind(v as ConnectionKind)}
              >
                <SelectTrigger className="w-auto">
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

            <div>
              <Button size="sm" onClick={add} disabled={busy || !datesOk}>
                {busy ? "Adding…" : "Add connection"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
