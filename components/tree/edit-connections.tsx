"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { connectExistingPeople, removeRelationship } from "@/app/actions/people";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
  members,
  connections,
}: {
  personId: string;
  personName: string;
  members: TreeMemberOption[];
  connections: ExistingConnection[];
}) {
  const router = useRouter();

  const [otherId, setOtherId] = React.useState("");
  const [kind, setKind] = React.useState<ConnectionKind>("child");
  const [marriageDate, setMarriageDate] = React.useState("");
  const [isDivorced, setIsDivorced] = React.useState(false);
  const [divorceDate, setDivorceDate] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);

  const otherLabel =
    members.find((m) => m.id === otherId)?.label ?? "the other person";

  function resetForm() {
    setOtherId("");
    setKind("child");
    setMarriageDate("");
    setIsDivorced(false);
    setDivorceDate("");
  }

  async function add() {
    if (!otherId) {
      toast.error("Pick someone already in the tree.");
      return;
    }
    setBusy(true);
    const res = await connectExistingPeople({
      personId,
      otherId,
      kind,
      marriage_date: marriageDate,
      is_divorced: isDivorced,
      divorce_date: divorceDate,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Connection added.");
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
                <SelectTrigger className="w-[210px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {personName} {KIND_STATEMENT[k]} {otherLabel}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-medium">{otherLabel}</span>
            </div>

            {kind === "spouse" ? (
              <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="conn-marriage" className="text-xs font-normal">
                    Marriage date (optional)
                  </Label>
                  <Input
                    id="conn-marriage"
                    type="date"
                    value={marriageDate}
                    onChange={(e) => setMarriageDate(e.target.value)}
                  />
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
                    <Input
                      id="conn-divorce"
                      type="date"
                      value={divorceDate}
                      onChange={(e) => setDivorceDate(e.target.value)}
                    />
                  </div>
                ) : null}
              </div>
            ) : null}

            <div>
              <Button size="sm" onClick={add} disabled={busy}>
                {busy ? "Adding…" : "Add connection"}
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  );
}
