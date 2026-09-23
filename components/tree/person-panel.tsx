"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { claimPerson, disputeClaim } from "@/app/actions/claims";
import { setEntryVerified } from "@/app/actions/entry-comments";
import { sendClaimInvite } from "@/app/actions/invites";
import {
  setPersonPhotoCrop,
  updateRelationshipMarriage,
} from "@/app/actions/people";
import { deletePerson } from "@/app/actions/privacy";
import { describeClaimInvite, type EntryInvite } from "@/lib/claim-invites";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AncestralLands } from "@/components/ancestral-lands";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PersonDocuments } from "@/components/person-documents";
import { ConnectionPromptList } from "@/components/tree/connection-prompts";
import { AddCompanionDialog } from "@/components/tree/add-companion-dialog";
import { AddRelativeButton } from "@/components/tree/add-relative-button";
import type { CompanionOption } from "@/components/tree/companion-picker";
import { DateField } from "@/components/date-field";
import { PhotoCropEditor } from "@/components/photo-crop-editor";
import { EntryComments } from "@/components/tree/entry-comments";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
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
import {
  cropStyle,
  DEFAULT_CROP,
  parseCrop,
  type CropTransform,
} from "@/lib/image-crop";
import {
  formatPartialDate,
  marriageDateProblems,
  toStoredDate,
} from "@/lib/partial-date";
import { LOCKED_ENTRY_NOTE } from "@/lib/account-types";
import { SEX_LABELS, type Sex } from "@/lib/person-schema";
import { PersonTrees } from "@/components/tree/person-trees";
import { editPersonHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";
import {
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  type PetSpecies,
} from "@/lib/pet-schema";
import type { TreePet } from "@/lib/pets";
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

/**
 * A place of birth or death, with whose land it is beneath it (Step 27). It
 * takes the panel's full width, so the lands have room to read and don't
 * reflow the grid when Native Land Digital's names arrive.
 */
function PlaceField({
  label,
  place,
  wording,
  placeId,
  shareToken,
}: {
  label: string;
  place: string | null;
  wording: string | null;
  placeId: number | null;
  shareToken: string | null;
}) {
  if (!place) return null;
  return (
    <div className="col-span-2 flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-1 text-sm text-foreground">
        <span>{place}</span>
        <AncestralLands
          wording={wording}
          placeId={placeId}
          shareToken={shareToken}
        />
      </dd>
    </div>
  );
}

function PendingConnectionPrompts({
  suggestions,
  onResolved,
}: {
  suggestions: PanelSuggestion[];
  onResolved: () => void;
}) {
  if (suggestions.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Connections to check</h2>
      <ConnectionPromptList suggestions={suggestions} onResolved={onResolved} />
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
  // Marriage dates have to be whole (no precision column on relationships).
  const dateProblems = marriageDateProblems({
    marriageDate,
    isDivorced,
    divorceDate,
  });
  const datesOk = !dateProblems.marriage && !dateProblems.divorce;

  async function save() {
    if (!datesOk) return;
    setBusy(true);
    const res = await updateRelationshipMarriage(relation.id, {
      // Padded to ISO: a one-digit day types as "1965-03-5".
      marriage_date: toStoredDate(marriageDate).date,
      is_divorced: isDivorced,
      divorce_date: toStoredDate(divorceDate).date,
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
            Divorced
            {relation.divorceDate
              ? ` ${formatPartialDate(relation.divorceDate)}`
              : ""}
          </Badge>
        ) : null}
      </div>

      {relation.marriageDate && !editing ? (
        <p className="text-xs text-muted-foreground">
          Married {formatPartialDate(relation.marriageDate)}
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
            <DateField
              id={`marriage-${relation.id}`}
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
              <DateField
                id={`divorce-${relation.id}`}
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
          <div className="flex gap-2">
            <Button size="sm" onClick={save} disabled={busy || !datesOk}>
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
          <dt className="text-xs font-medium text-muted-foreground">
            Children
          </dt>
          <dd className="text-sm">
            {children.map((c) => c.otherName).join(", ")}
          </dd>
        </div>
      ) : null}
    </section>
  );
}

/**
 * The pets this person lived with.
 *
 * Kept apart from `FamilySection` on purpose: companions are listed *after*
 * the family, in their own section, with their own wording — never as another
 * kind of relative in the same list.
 */
function CompanionsSection({
  pets,
  canAdd,
  onSelectPet,
  onAdd,
}: {
  pets: TreePet[];
  canAdd: boolean;
  onSelectPet: (petId: string) => void;
  onAdd: () => void;
}) {
  if (pets.length === 0 && !canAdd) return null;

  return (
    <section className="flex flex-col gap-3 border-t border-border pt-5">
      <h2 className="text-sm font-semibold">Companions</h2>
      {pets.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {pets.map((pet) => (
            <li key={pet.id}>
              <button
                type="button"
                className="flex w-full items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => onSelectPet(pet.id)}
              >
                <span aria-hidden>
                  {SPECIES_GLYPHS[pet.species as PetSpecies] ??
                    SPECIES_GLYPHS.other}
                </span>
                <span className="min-w-0 flex-1 truncate">{pet.name}</span>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {speciesLabel(pet)}
                  {petYears(pet) ? ` · ${petYears(pet)}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">
          No pets on this entry yet.
        </p>
      )}
      {canAdd ? (
        <Button
          size="sm"
          variant="outline"
          className="self-start"
          onClick={onAdd}
        >
          Add a companion
        </Button>
      ) : null}
    </section>
  );
}

/**
 * Who has invited this entry's person to claim it, and when (Step 38) — or,
 * once the last invite has lapsed, that it did.
 */
function ClaimInviteRecords({ invites }: { invites: EntryInvite[] }) {
  if (invites.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs text-muted-foreground">
      {invites.map((invite) => (
        <li key={invite.id}>{describeClaimInvite(invite, formatInviteDate)}</li>
      ))}
    </ul>
  );
}

function formatInviteDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PersonPanel({
  person,
  treeId,
  pets,
  people,
  onSelectPet,
  suggestions,
  relations,
  isAdmin,
  isSelf,
  canEdit,
  canSeeDocuments,
  canDelete = false,
  canInviteToClaim = false,
  claimInvites = [],
  claimable,
  claimNote = null,
  isCreator,
  currentUserId,
  readOnly = false,
  shareToken = null,
  addRelativeOf = null,
  connectionPrompt = null,
  onClose,
}: {
  person: TreeGraphPerson | null;
  treeId: string;
  /** This person's companion animals. Not relatives — see `pet-node.tsx`. */
  pets: TreePet[];
  /** Everyone on the canvas, so a new companion can be shared with them. */
  people: CompanionOption[];
  onSelectPet: (petId: string) => void;
  /** View-only (a share link, or a visitor) — hide every editing / moderation affordance. */
  readOnly?: boolean;
  /** On a share link: how its cards ask whose land a place is (Step 27.9). */
  shareToken?: string | null;
  /** Pending implied connections involving this person the viewer can resolve. */
  suggestions: PanelSuggestion[];
  /** This person's parent / child / spouse links (spouse rows carry dates). */
  relations: PersonRelation[];
  isAdmin: boolean;
  isSelf: boolean;
  canEdit: boolean;
  /** Documents are the owner's, their Branch's and the Roots' (Step 18.4). */
  canSeeDocuments: boolean;
  /**
   * Offer "Delete entry" (Step 22.3): a Root, or the Branch or Leaf who added
   * it while it is still theirs (`canOfferDelete`). The database still
   * refuses once somebody else has built on it.
   */
  canDelete?: boolean;
  /**
   * Offer to invite someone to claim this entry (Step 22.1): it is the
   * viewer's to hand over and nobody is behind it yet (`canInviteToClaim`).
   * Whoever accepts joins as a Leaf.
   */
  canInviteToClaim?: boolean;
  /**
   * Invites out to claim this entry — who sent each and when (Step 38),
   * shown to every member so nobody sends a second without knowing.
   */
  claimInvites?: EntryInvite[];
  currentUserId: string;
  /** This entry looks like the signed-in member and is unclaimed. */
  claimable: boolean;
  /** Who claiming it moves off the member's own entry, which it merges
   *  away (Step 36), asked before "This is me" goes ahead. */
  claimNote?: string | null;
  /** The signed-in member originally created this entry. */
  isCreator: boolean;
  /** Offer "Add a relative of …" here too, for a phone, where this sheet
   *  covers the canvas and its Add button (Step 19.2). `null` when the
   *  viewer can't add relatives. */
  addRelativeOf?: { id: string; name: string } | null;
  /** Shown first when this person was opened from a search: the canvas's
   *  offer to light their connection to somebody else. */
  connectionPrompt?: React.ReactNode;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = person !== null;
  const [busy, setBusy] = React.useState(false);
  const [disputing, setDisputing] = React.useState(false);
  const [confirmingClaim, setConfirmingClaim] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [addingCompanion, setAddingCompanion] = React.useState(false);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [claimEmail, setClaimEmail] = React.useState("");
  const savedCrop = parseCrop(person?.photo_crop);
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [prevId, setPrevId] = React.useState(person?.id);

  // Reset the inline dispute form whenever a different person is selected.
  if (person?.id !== prevId) {
    setPrevId(person?.id);
    setDisputing(false);
    setConfirmingClaim(false);
    setReason("");
    setPhotoOpen(false);
    setAddingCompanion(false);
    setCropOpen(false);
    setCrop(savedCrop);
    setClaimEmail("");
  }

  async function onSaveCrop() {
    if (!person) return;
    setBusy(true);
    const res = await setPersonPhotoCrop(person.id, crop);
    setBusy(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setCropOpen(false);
    toast.success("Photo repositioned.");
    router.refresh();
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
    toast.success("Merged — this is now your entry.");
    onClose();
    router.refresh();
  }

  async function onSendClaimInvite() {
    if (!person) return;
    setBusy(true);
    const res = await sendClaimInvite(person.id, claimEmail);
    setBusy(false);
    // Either way: an invite whose email failed is still made, and listed.
    router.refresh();
    if (res.error) {
      toast.error(res.error);
      return;
    }
    setClaimEmail("");
    toast.success(`Invite sent to ${res.email ?? "them"}.`);
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
    toast.success(
      person.verified_at ? "Verification cleared." : "Entry marked verified.",
    );
    router.refresh();
  }

  async function onDelete() {
    if (!person) return;
    if (
      !window.confirm(
        isAdmin
          ? "Permanently delete this entry, its relationships, photo, and documents? This cannot be undone."
          : "Permanently delete this entry you added, with its connections, photo and documents? This cannot be undone.",
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
    // Non-modal, with no scrim: the canvas behind is doing the work of showing
    // this person's own tree lit against the blurred rest of the family, and a
    // backdrop would blur the spotlight away along with everything else. It
    // stays live too, so clicking another relative moves the spotlight onto
    // them rather than only dismissing the panel. `data-docked-sheet` moves
    // the site header aside while it's open (globals.css).
    <Sheet
      open={open}
      modal={false}
      disablePointerDismissal
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent
        data-docked-sheet
        showOverlay={false}
        // Over a portrait, the sheet's own ghost close button can land on a
        // pale patch of photograph and disappear; with a photo the panel
        // brings its own.
        showCloseButton={!person?.photo_url}
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        {person ? (
          <>
            {/* With a photo, the panel opens on the person's face: a portrait
                across the full width of the sheet, with the name over the foot
                of it. The old inline avatar was a 48px circle wedged between
                the title and the close button, which is both the least you can
                do with a photograph and the most crowded place to put one. */}
            {person.photo_url ? (
              <>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="absolute top-3 right-3 z-10 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                >
                  <span aria-hidden>✕</span>
                </button>
                <button
                  type="button"
                  className="group relative block aspect-[4/3] w-full shrink-0 cursor-zoom-in overflow-hidden bg-muted outline-none"
                  onClick={() => setPhotoOpen(true)}
                  aria-label={`View photo of ${personDisplayName(person)}`}
                >
                  <img
                    src={person.photo_url}
                    alt=""
                    style={cropStyle(parseCrop(person.photo_crop))}
                    className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                  />
                  {/* The name sits on the photo, over a scrim dark enough to
                    carry it whatever the picture underneath is doing. */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 to-transparent px-4 pt-10 pb-3 text-left">
                    <p className="font-heading truncate text-base font-medium text-white">
                      {personDisplayName(person)}
                    </p>
                    <p className="truncate text-sm text-white/80">
                      {personLifespan(person) ?? "Living"}
                      {isSelf ? " · Your entry" : ""}
                    </p>
                  </div>
                </button>
              </>
            ) : null}
            <SheetHeader className={cn("gap-3", person.photo_url && "pt-3")}>
              {person.photo_url ? (
                <>
                  {/* The sheet still needs its accessible name and description,
                      but they are on the photo now. */}
                  <SheetTitle className="sr-only">
                    {personDisplayName(person)}
                  </SheetTitle>
                  <SheetDescription className="sr-only">
                    {personLifespan(person) ?? "Living"}
                  </SheetDescription>
                </>
              ) : (
                <div className="flex items-center gap-3">
                  <Avatar size="lg">
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
              )}
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
                {person.account_type ? (
                  <AccountTypeBadge role={person.account_type} />
                ) : null}
                {person.claim_status === "disputed" ? (
                  <Badge variant="destructive">Ownership disputed</Badge>
                ) : null}
                {isAdmin && person.lineage_type ? (
                  <Badge variant="outline">
                    Lineage: {person.lineage_type}
                  </Badge>
                ) : null}
              </div>
              {addRelativeOf && !readOnly ? (
                <AddRelativeButton
                  relatedTo={addRelativeOf}
                  className="w-full sm:hidden"
                />
              ) : null}
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              {connectionPrompt}
              {!readOnly ? (
                <PersonTrees personId={person.id} currentTreeId={treeId} />
              ) : null}
              <dl className="grid grid-cols-2 gap-4">
                <Field label="First name" value={person.first_name} />
                <Field label="Middle name" value={person.middle_name} />
                <Field label="Preferred name" value={person.preferred_name} />
                <Field label="Maiden name" value={person.maiden_name} />
                <Field label="Last name" value={person.last_name} />
                <Field
                  label="Email"
                  value={
                    person.email ? (
                      <a
                        href={`mailto:${person.email}`}
                        className="underline underline-offset-2"
                      >
                        {person.email}
                      </a>
                    ) : null
                  }
                />
                <Field
                  label="Sex"
                  value={
                    person.sex ? (SEX_LABELS[person.sex as Sex] ?? null) : null
                  }
                />
                <Field
                  label="Date of birth"
                  value={formatPartialDate(
                    person.date_of_birth,
                    person.date_of_birth_precision,
                  )}
                />
                <PlaceField
                  label="Place of birth"
                  place={
                    person.birth_place_historical ||
                    [person.city_of_birth, person.country_of_birth]
                      .filter(Boolean)
                      .join(", ") ||
                    null
                  }
                  wording={person.ancestral_lands_birth}
                  placeId={person.place_id_birth}
                  shareToken={shareToken}
                />
                {person.is_deceased ? (
                  <>
                    <Field
                      label="Date of death"
                      value={formatPartialDate(
                        person.date_of_death,
                        person.date_of_death_precision,
                      )}
                    />
                    <PlaceField
                      label="Place of death"
                      place={
                        person.death_place_historical || person.place_of_death
                      }
                      wording={person.ancestral_lands_death}
                      placeId={person.place_id_death}
                      shareToken={shareToken}
                    />
                  </>
                ) : null}
              </dl>

              {canEdit && !person.maiden_name ? (
                <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  No maiden name on this entry yet.{" "}
                  <Link
                    href={editPersonHref(person.id)}
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

              <CompanionsSection
                pets={pets}
                canAdd={!readOnly && canEdit}
                onSelectPet={onSelectPet}
                onAdd={() => setAddingCompanion(true)}
              />

              <PendingConnectionPrompts
                suggestions={suggestions}
                onResolved={() => router.refresh()}
              />

              {!readOnly ? (
                <section className="border-t border-border pt-5">
                  {canSeeDocuments ? (
                    <PersonDocuments
                      personId={person.id}
                      treeId={treeId}
                      canEdit={canEdit}
                    />
                  ) : (
                    // Not "No documents yet" — there may be some, just not
                    // theirs to see.
                    <div className="flex flex-col gap-1">
                      <h2 className="text-sm font-semibold">Documents</h2>
                      <p className="text-xs text-muted-foreground">
                        Private to this entry&rsquo;s owner, the Branch for this
                        side of the family, and the Roots.
                      </p>
                    </div>
                  )}
                </section>
              ) : null}

              {!readOnly ? (
                <section className="border-t border-border pt-5">
                  <EntryComments
                    personId={person.id}
                    treeId={treeId}
                    currentUserId={currentUserId}
                    canModerate={canEdit}
                  />
                </section>
              ) : null}

              {!readOnly ? (
                <section className="flex flex-col gap-3 border-t border-border pt-5">
                  <h2 className="text-sm font-semibold">Manage</h2>

                  <div className="flex flex-wrap gap-2">
                    {canEdit ? (
                      <Button
                        nativeButton={false}
                        render={<Link href={editPersonHref(person.id)} />}
                        variant="outline"
                        size="sm"
                      >
                        Edit entry
                      </Button>
                    ) : null}

                    {canEdit && person.photo_url ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCrop(savedCrop);
                          setCropOpen(true);
                        }}
                      >
                        Reposition photo
                      </Button>
                    ) : null}

                    {!isSelf &&
                    claimable &&
                    !person.claim_status &&
                    !confirmingClaim ? (
                      <Button
                        size="sm"
                        onClick={() => setConfirmingClaim(true)}
                        disabled={busy}
                      >
                        This is me — claim it
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

                    {canDelete && !readOnly ? (
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

                  {/* Claiming merges the viewer's own entry into this one and
                      deletes it, so it asks first (Step 36). */}
                  {!isSelf &&
                  claimable &&
                  !person.claim_status &&
                  confirmingClaim ? (
                    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <p className="text-xs text-muted-foreground">
                        {claimNote}
                      </p>
                      <div className="flex gap-2">
                        <Button size="sm" onClick={onClaim} disabled={busy}>
                          {busy ? "Merging…" : "Yes, merge"}
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setConfirmingClaim(false)}
                          disabled={busy}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}

                  {/* Nobody is behind this entry yet, and it is the viewer's to
                      hand over (`canInviteToClaim`). The server asks the
                      database the same thing before minting the link. */}
                  {canInviteToClaim ? (
                    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                      <Label
                        htmlFor="claim-invite-email"
                        className="text-xs font-medium"
                      >
                        Invite {personDisplayName(person)} to claim this entry
                      </Label>
                      <ClaimInviteRecords invites={claimInvites} />
                      <div className="flex flex-wrap gap-2">
                        <Input
                          id="claim-invite-email"
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          className="min-w-[12rem] flex-1"
                          value={claimEmail}
                          onChange={(e) => setClaimEmail(e.target.value)}
                          placeholder="them@example.com"
                          disabled={busy}
                        />
                        <Button
                          size="sm"
                          onClick={onSendClaimInvite}
                          disabled={busy || claimEmail.trim().length === 0}
                        >
                          {busy
                            ? "Sending…"
                            : claimInvites.some((i) => i.live)
                              ? "Send another"
                              : "Send invite"}
                        </Button>
                      </div>
                      <JoinsAsNote />
                      <p className="text-xs text-muted-foreground">
                        Emails them a single-use link, good for 14 days. It
                        names this entry, and claiming it hands them the
                        record to keep up to date.
                      </p>
                    </div>
                  ) : claimInvites.length > 0 ? (
                    // Everyone else on the tree still sees that it's in hand.
                    <ClaimInviteRecords invites={claimInvites} />
                  ) : null}

                  {person.verified_at ? (
                    <p className="text-xs text-muted-foreground">
                      Verified by an admin on{" "}
                      {new Date(person.verified_at).toLocaleDateString()}.
                    </p>
                  ) : null}

                  {!canEdit && !claimable && !isSelf ? (
                    <p className="text-xs text-muted-foreground">
                      {LOCKED_ENTRY_NOTE}
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
              ) : null}
            </div>

            {!readOnly && canEdit ? (
              <AddCompanionDialog
                open={addingCompanion}
                onOpenChange={setAddingCompanion}
                treeId={treeId}
                people={people}
                startingWith={person.id}
                isAdmin={isAdmin}
              />
            ) : null}

            {person.photo_url && canEdit ? (
              <Dialog
                open={cropOpen}
                onOpenChange={(next) => {
                  if (!next) setCrop(savedCrop);
                  setCropOpen(next);
                }}
              >
                <DialogContent className="sm:max-w-sm">
                  <DialogTitle>
                    Reposition photo of {personDisplayName(person)}
                  </DialogTitle>
                  <div className="flex flex-col items-center gap-4 pt-2">
                    <PhotoCropEditor
                      url={person.photo_url}
                      crop={crop}
                      onCropChange={setCrop}
                      onUnreadable={() => {
                        toast.error("That photo couldn't be loaded.");
                        setCropOpen(false);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={onSaveCrop} disabled={busy}>
                        {busy ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCrop(savedCrop);
                          setCropOpen(false);
                        }}
                        disabled={busy}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCrop(DEFAULT_CROP)}
                        disabled={busy}
                      >
                        Reset
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            ) : null}

            {person.photo_url ? (
              <Dialog open={photoOpen} onOpenChange={setPhotoOpen}>
                <DialogContent className="w-fit max-w-[calc(100%-2rem)] bg-transparent p-0 ring-0 sm:max-w-lg">
                  <DialogTitle className="sr-only">
                    Photo of {personDisplayName(person)}
                  </DialogTitle>
                  <img
                    src={person.photo_url}
                    alt={`Photo of ${personDisplayName(person)}`}
                    className="max-h-[80vh] w-auto rounded-xl object-contain"
                  />
                </DialogContent>
              </Dialog>
            ) : null}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
