"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimPerson, disputeClaim } from "@/app/actions/claims";
import { setEntryVerified } from "@/app/actions/entry-comments";
import {
  resolveConnectionSuggestion,
  updateRelationshipMarriage,
} from "@/app/actions/people";
import { deletePerson } from "@/app/actions/privacy";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { PersonDocuments } from "@/components/person-documents";
import { EntryComments } from "@/components/tree/entry-comments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function suggestionQuestion(s: PanelSuggestion): string {
  if (s.source === "co_parent") {
    return `Are ${s.subjectLabel} and ${s.relatedLabel} married or partners?`;
  }
  if (s.source === "unlinked_spouse_child") {
    return `Is ${s.subjectLabel} also a parent of ${s.relatedLabel}?`;
  }
  return `${s.subjectLabel} shares a last name and birth year with ${s.relatedLabel} — are they related?`;
}

function PendingConnectionPrompts({
  suggestions,
  onResolved,
}: {
  suggestions: PanelSuggestion[];
  onResolved: () => void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);

  async function resolve(
    id: string,
    resolution: "accepted" | "dismissed" | "pending",
  ) {
    setBusyId(id);
    const res = await resolveConnectionSuggestion(id, resolution);
    setBusyId(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(
      resolution === "accepted"
        ? "Connection added."
        : resolution === "dismissed"
          ? "Dismissed."
          : "We'll ask again later.",
    );
    onResolved();
  }

  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Connections to check</h2>
      <ul className="flex flex-col gap-3">
        {suggestions.map((s) => (
          <li
            key={s.id}
            className="flex flex-col gap-2 rounded-md border border-border p-3"
          >
            <p className="text-sm">{suggestionQuestion(s)}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busyId !== null}
                onClick={() => resolve(s.id, "accepted")}
              >
                {s.suggestedType === "sibling_check" ? "Yes" : "Yes, link them"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busyId !== null}
                onClick={() => resolve(s.id, "dismissed")}
              >
                No
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={busyId !== null}
                onClick={() => resolve(s.id, "pending")}
              >
                Skip for now
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

export type PersonRelation = {
  id: string;
  otherName: string;
  kind: "spouse" | "parent" | "child";
  marriageDate: string | null;
  isDivorced: boolean;
  divorceDate: string | null;
  canEdit: boolean;
};

function SpouseRow({
  relation,
  onChanged,
}: {
  relation: PersonRelation;
  onChanged: () => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [marriageDate, setMarriageDate] = React.useState(
    relation.marriageDate ?? "",
  );
  const [isDivorced, setIsDivorced] = React.useState(relation.isDivorced);
  const [divorceDate, setDivorceDate] = React.useState(
    relation.divorceDate ?? "",
  );
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const res = await updateRelationshipMarriage(relation.id, {
      marriage_date: marriageDate,
      is_divorced: isDivorced,
      divorce_date: divorceDate,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Saved.");
    setEditing(false);
    onChanged();
  }

  return (
    <div className="flex flex-col gap-1.5 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-muted-foreground">
          Spouse / partner
        </span>
        <span className="text-sm text-foreground">{relation.otherName}</span>
        {relation.isDivorced ? (
          <Badge variant="outline">
            Divorced{relation.divorceDate ? ` ${relation.divorceDate}` : ""}
          </Badge>
        ) : null}
      </div>

      {relation.marriageDate && !editing ? (
        <p className="text-xs text-muted-foreground">
          Married {relation.marriageDate}
        </p>
      ) : null}

      {!editing && relation.canEdit ? (
        <button
          type="button"
          className="self-start text-xs text-foreground underline underline-offset-2"
          onClick={() => setEditing(true)}
        >
          {relation.marriageDate || relation.isDivorced
            ? "Edit marriage / divorce"
            : "Add marriage / divorce dates"}
        </button>
      ) : null}

      {editing ? (
        <div className="mt-1 flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`marriage-${relation.id}`} className="text-xs">
              Marriage date
            </Label>
            <Input
              id={`marriage-${relation.id}`}
              type="date"
              value={marriageDate}
              onChange={(e) => setMarriageDate(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-3 text-sm">
            <Checkbox
              id={`divorced-${relation.id}`}
              checked={isDivorced}
              onCheckedChange={(c) => setIsDivorced(c === true)}
            />
            <span>They later divorced</span>
          </label>
          {isDivorced ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`divorce-${relation.id}`} className="text-xs">
                Divorce date
              </Label>
              <Input
                id={`divorce-${relation.id}`}
                type="date"
                value={divorceDate}
                onChange={(e) => setDivorceDate(e.target.value)}
              />
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setMarriageDate(relation.marriageDate ?? "");
                setIsDivorced(relation.isDivorced);
                setDivorceDate(relation.divorceDate ?? "");
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function FamilySection({
  relations,
  onChanged,
}: {
  relations: PersonRelation[];
  onChanged: () => void;
}) {
  if (relations.length === 0) return null;
  const spouses = relations.filter((r) => r.kind === "spouse");
  const parents = relations.filter((r) => r.kind === "parent");
  const children = relations.filter((r) => r.kind === "child");

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Family</h2>
      {spouses.map((s) => (
        <SpouseRow key={s.id} relation={s} onChanged={onChanged} />
      ))}
      {parents.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">Parents</dt>
          <dd className="text-sm">
            {parents.map((p) => p.otherName).join(", ")}
          </dd>
        </div>
      ) : null}
      {children.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <dt className="text-xs font-medium text-muted-foreground">Children</dt>
          <dd className="text-sm">
            {children.map((c) => c.otherName).join(", ")}
          </dd>
        </div>
      ) : null}
    </section>
  );
}

export function PersonPanel({
  person,
  treeId,
  suggestions,
  relations,
  isAdmin,
  isSelf,
  canEdit,
  claimable,
  isCreator,
  currentUserId,
  onClose,
}: {
  person: TreeGraphPerson | null;
  treeId: string;
  /** Pending implied connections involving this person the viewer can resolve. */
  suggestions: PanelSuggestion[];
  /** This person's parent / child / spouse links (spouse rows carry dates). */
  relations: PersonRelation[];
  isAdmin: boolean;
  isSelf: boolean;
  canEdit: boolean;
  currentUserId: string;
  /** This entry looks like the signed-in member and is unclaimed. */
  claimable: boolean;
  /** The signed-in member originally created this entry. */
  isCreator: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = person !== null;
  const [busy, setBusy] = React.useState(false);
  const [disputing, setDisputing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [prevId, setPrevId] = React.useState(person?.id);

  // Reset the inline dispute form whenever a different person is selected.
  if (person?.id !== prevId) {
    setPrevId(person?.id);
    setDisputing(false);
    setReason("");
  }

  async function onClaim() {
    if (!person) return;
    setBusy(true);
    const res = await claimPerson(person.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Claimed — this is now your entry.");
    onClose();
    router.refresh();
  }

  async function onToggleVerified() {
    if (!person) return;
    setBusy(true);
    const res = await setEntryVerified(person.id, !person.verified_at);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(person.verified_at ? "Verification cleared." : "Entry marked verified.");
    router.refresh();
  }

  async function onDelete() {
    if (!person) return;
    if (
      !window.confirm(
        "Permanently delete this entry, its relationships, photo, and documents? This cannot be undone.",
      )
    ) {
      return;
    }
    setBusy(true);
    const res = await deletePerson(person.id);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Entry deleted.");
    onClose();
    router.refresh();
  }

  async function onDispute() {
    if (!person?.claim_id) return;
    setBusy(true);
    const res = await disputeClaim(person.claim_id, reason);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Dispute sent to an admin.");
    setDisputing(false);
    onClose();
    router.refresh();
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {person ? (
          <>
            <SheetHeader className="gap-3">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  {person.photo_url ? (
                    <AvatarImage src={person.photo_url} alt="" />
                  ) : null}
                  <AvatarFallback>{personInitials(person)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">
                    {personDisplayName(person)}
                  </SheetTitle>
                  <SheetDescription>
                    {personLifespan(person) ?? "Living"}
                    {isSelf ? " · Your entry" : ""}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {person.is_deceased ? (
                  <Badge variant="secondary">Deceased</Badge>
                ) : null}
                {person.verified_at ? (
                  <Badge variant="default">Verified</Badge>
                ) : null}
                {person.open_flag_count > 0 ? (
                  <Badge variant="destructive">
                    {person.open_flag_count} open flag
                    {person.open_flag_count === 1 ? "" : "s"}
                  </Badge>
                ) : null}
                {person.claim_status === "approved" ? (
                  <Badge variant="outline">Claimed</Badge>
                ) : null}
                {person.claim_status === "disputed" ? (
                  <Badge variant="destructive">Ownership disputed</Badge>
                ) : null}
                {isAdmin && person.lineage_type ? (
                  <Badge variant="outline">Lineage: {person.lineage_type}</Badge>
                ) : null}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="First name" value={person.first_name} />
                <Field label="Middle name" value={person.middle_name} />
                <Field label="Preferred name" value={person.preferred_name} />
                <Field label="Maiden name" value={person.maiden_name} />
                <Field label="Last name" value={person.last_name} />
                <Field label="Date of birth" value={person.date_of_birth} />
                <Field
                  label="Place of birth"
                  value={
                    [person.city_of_birth, person.country_of_birth]
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
                {person.is_deceased ? (
                  <>
                    <Field
                      label="Date of death"
                      value={person.date_of_death}
                    />
                    <Field
                      label="Place of death"
                      value={person.place_of_death}
                    />
                  </>
                ) : null}
              </dl>

              {canEdit && !person.maiden_name ? (
                <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  No maiden name on this entry yet.{" "}
                  <Link
                    href={`/people/${person.id}/edit`}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    Add one
                  </Link>{" "}
                  if you know it.
                </div>
              ) : null}

              <FamilySection
                relations={relations}
                onChanged={() => router.refresh()}
              />

              <PendingConnectionPrompts
                suggestions={suggestions}
                onResolved={() => router.refresh()}
              />

              <section className="border-t border-border pt-5">
                <PersonDocuments personId={person.id} treeId={treeId} />
              </section>

              <section className="border-t border-border pt-5">
                <EntryComments
                  personId={person.id}
                  currentUserId={currentUserId}
                  canModerate={canEdit}
                />
              </section>

              <section className="flex flex-col gap-3 border-t border-border pt-5">
                <h2 className="text-sm font-semibold">Manage</h2>

                <div className="flex flex-wrap gap-2">
                  {canEdit ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={`/people/${person.id}/edit`} />}
                      variant="outline"
                      size="sm"
                    >
                      Edit entry
                    </Button>
                  ) : null}

                  {!isSelf && claimable && !person.claim_status ? (
                    <Button size="sm" onClick={onClaim} disabled={busy}>
                      {busy ? "Claiming…" : "This is me — claim it"}
                    </Button>
                  ) : null}

                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={onToggleVerified}
                      disabled={busy}
                    >
                      {person.verified_at
                        ? "Clear verified"
                        : "Mark verified"}
                    </Button>
                  ) : null}

                  {isAdmin ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={onDelete}
                      disabled={busy}
                    >
                      Delete entry
                    </Button>
                  ) : null}
                </div>

                {person.verified_at ? (
                  <p className="text-xs text-muted-foreground">
                    Verified by an admin on{" "}
                    {new Date(person.verified_at).toLocaleDateString()}.
                  </p>
                ) : null}

                {!canEdit && !claimable && !isSelf ? (
                  <p className="text-xs text-muted-foreground">
                    Only the entry owner or an admin can edit this entry.
                  </p>
                ) : null}

                {person.claim_status === "approved" && isCreator ? (
                  disputing ? (
                    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <label
                        htmlFor="dispute-reason"
                        className="text-xs font-medium text-muted-foreground"
                      >
                        Why is this claim wrong? (optional)
                      </label>
                      <Input
                        id="dispute-reason"
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="This isn't the same person…"
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={onDispute}
                          disabled={busy}
                        >
                          {busy ? "Sending…" : "Send dispute"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setDisputing(false)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="self-start text-xs text-destructive underline underline-offset-2"
                      onClick={() => setDisputing(true)}
                    >
                      You created this entry — dispute the claim
                    </button>
                  )
                ) : null}

                {person.claim_status === "disputed" ? (
                  <p className="text-xs text-muted-foreground">
                    A dispute over this entry is with an admin.
                  </p>
                ) : null}
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
