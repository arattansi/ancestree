"use client";

import * as React from "react";
import Link from "next/link";
import { Lightbulb, Minimize2, Pencil } from "lucide-react";

import { claimPerson, disputeClaim } from "@/app/actions/claims";
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
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import { PersonDocuments } from "@/components/person-documents";
import { ConnectionPromptList } from "@/components/tree/connection-prompts";
import { AddCompanionDialog } from "@/components/tree/add-companion-dialog";
import { AddRelativeButton } from "@/components/tree/add-relative-button";
import type { CompanionOption } from "@/components/tree/companion-picker";
import { PhotoCropEditor } from "@/components/photo-crop-editor";
import { SpouseDatesFields } from "@/components/spouse-dates-fields";
import { EntryComments } from "@/components/tree/entry-comments";
import { EntrySuggestions } from "@/components/tree/entry-suggestions";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { toastError, useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import {
  maidenLine,
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
  asDayMonth,
  formatPartialDate,
  marriageDateProblems,
  toPartialIso,
  type DayMonth,
} from "@/lib/partial-date";
import { FILL_ENTRY_NOTE, LOCKED_ENTRY_NOTE } from "@/lib/account-types";
import { BASIC_DETAILS, waitingOn } from "@/lib/carry";
import { blankFields } from "@/lib/fill-blanks";
import { SEX_LABELS, type Sex } from "@/lib/person-schema";
import { PersonTrees } from "@/components/tree/person-trees";
import { countOf } from "@/lib/plural";
import { toStoredSpouseDates, type SpouseDates } from "@/lib/spouse-dates";
import type { DeclinedSuggestion, EntrySuggestion } from "@/lib/suggestions";
import { editPersonHref, suggestChangeHref } from "@/lib/tree-links";
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
  placeId,
  shareToken,
}: {
  label: string;
  place: string | null;
  placeId: number | null;
  shareToken: string | null;
}) {
  if (!place) return null;
  return (
    <div className="col-span-2 flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="flex flex-col gap-1 text-sm text-foreground">
        <span>{place}</span>
        <AncestralLands placeId={placeId} shareToken={shareToken} />
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
  /** A wedding day kept without its year, when there's no date (Step 63). */
  marriageWithoutYear: DayMonth | null;
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
  const savedMarriage = toPartialIso(
    relation.marriageDate,
    "day",
    relation.marriageWithoutYear,
  );
  const saved: SpouseDates = {
    marriage_date: savedMarriage,
    is_divorced: relation.isDivorced,
    divorce_date: relation.divorceDate ?? "",
  };
  const [dates, setDates] = React.useState<SpouseDates>(saved);
  const idBase = `spouse-${relation.id}`;
  const action = useAction({ inline: true });
  // The sheet is non-modal, so nothing else keeps focus as the editor opens
  // and closes (Step 70).
  const returnFocus = useFocusReturn();
  const editRef = React.useRef<HTMLButtonElement>(null);
  // Marriage dates have to be whole (no precision column on relationships),
  // or a day and month without the year (Step 63).
  const dateProblems = marriageDateProblems({
    marriageDate: dates.marriage_date,
    isDivorced: dates.is_divorced,
    divorceDate: dates.divorce_date,
  });
  const datesOk = !dateProblems.marriage && !dateProblems.divorce;

  function save() {
    if (!datesOk) return;
    const stored = toStoredSpouseDates(dates);
    action.run(
      "save",
      () => updateRelationshipMarriage(relation.id, stored),
      {
        onSuccess: () => {
          returnFocus(() => editRef.current);
          setEditing(false);
          onChanged();
        },
      },
    );
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

      {savedMarriage && !editing ? (
        <p className="text-xs text-muted-foreground">
          Married{" "}
          {formatPartialDate(
            relation.marriageDate,
            "day",
            relation.marriageWithoutYear,
          )}
        </p>
      ) : null}

      {!editing && relation.canEdit ? (
        <button
          ref={editRef}
          type="button"
          className="relative tap-target self-start text-xs text-foreground underline underline-offset-2"
          onClick={() => {
            setEditing(true);
            // The link makes way for the editor: its first box takes focus.
            returnFocus(() => document.getElementById(`${idBase}-marriage`));
          }}
        >
          {savedMarriage || relation.isDivorced
            ? "Edit marriage / divorce"
            : "Add marriage / divorce dates"}
        </button>
      ) : null}

      {editing ? (
        <div className="mt-1 flex flex-col gap-3">
          <SpouseDatesFields
            idBase={idBase}
            value={dates}
            onPatch={(patch) => setDates((d) => ({ ...d, ...patch }))}
            errors={dateProblems}
            boxed={false}
          />
          <FormError>{action.error}</FormError>
          <div className="flex gap-2">
            <PendingButton
              size="sm"
              onClick={save}
              pending={action.pending}
              disabled={!datesOk}
              pendingLabel="Saving…"
            >
              Save
            </PendingButton>
            <Button
              size="sm"
              variant="ghost"
              disabled={action.pending}
              onClick={() => {
                returnFocus(() => editRef.current);
                setEditing(false);
                setDates(saved);
                action.setError(null);
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
        <li key={invite.id}>{describeClaimInvite(invite)}</li>
      ))}
    </ul>
  );
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
  canFill = false,
  canSeeDocuments,
  canDelete = false,
  canInviteToClaim = false,
  claimInvites = [],
  changeSuggestions = [],
  declinedSuggestions = [],
  claimable,
  claimNote = null,
  isCreator,
  currentUserId,
  readOnly = false,
  shareToken = null,
  addRelativeOf = null,
  connectionPrompt = null,
  minimized = false,
  onMinimize,
  minimizedFocus,
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
  /**
   * Not the viewer's to edit, but theirs to fill in where it's blank (Step
   * 44): an unclaimed entry on their own line (`canFillEntry`).
   */
  canFill?: boolean;
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
  /**
   * Suggested changes to this entry still waiting (Step 67): all of them for
   * someone who may edit it, to answer; the viewer's own otherwise.
   */
  changeSuggestions?: EntrySuggestion[];
  /** The viewer's own suggestions to this entry that were declined, to see
   *  why and resend (Step 72). */
  declinedSuggestions?: DeclinedSuggestion[];
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
  /**
   * Folded away to a card on the canvas (Step 49), so the tree they belong
   * to can be seen. The sheet closes but stays mounted, so nothing typed in
   * it is lost before it comes back.
   */
  minimized?: boolean;
  /** Offers "Minimize", which folds the details away. */
  onMinimize?: () => void;
  /** Where focus goes once they're folded away: the card. */
  minimizedFocus?: React.RefObject<HTMLElement | null>;
  onClose: () => void;
}) {
  const open = person !== null && !minimized;
  // A handle each, so one running leaves the others alone: pressing Delete
  // entry no longer shows the invite as sending (Step 70). Claim and Delete
  // ask first, and their dialogs carry their own.
  const cropSave = useAction({ inline: true });
  const invite = useAction({ inline: true });
  const dispute = useAction({ inline: true });
  // The sheet is non-modal, so nothing else keeps focus as its inline forms
  // open and close.
  const returnFocus = useFocusReturn();
  const claimEmailRef = React.useRef<HTMLInputElement>(null);
  const disputeLinkRef = React.useRef<HTMLButtonElement>(null);
  const [disputing, setDisputing] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [addingCompanion, setAddingCompanion] = React.useState(false);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [claimEmail, setClaimEmail] = React.useState("");
  const savedCrop = parseCrop(person?.photo_crop);
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [prevId, setPrevId] = React.useState(person?.id);
  // Under the name in the header, as on the person's card and leaf.
  const maiden = person ? maidenLine(person) : null;
  // A basic card (Step 80) is a name and a place of birth: nothing to edit,
  // fill in, comment on or manage from this tree.
  const basic = !!person?.basic;
  const locked = readOnly || basic;
  const waiting = person
    ? waitingOn(person.approval, person.asked_of, personDisplayName(person))
    : null;
  // With no dates to show, a basic card says what it is instead.
  const lifeLine = person
    ? basic
      ? BASIC_DETAILS
      : (personLifespan(person) ?? "Living")
    : "";
  // Something here is blank, and the viewer may fill it in (Step 44).
  const fillable =
    !!person && canFill && !locked && blankFields(person).length > 0;
  // What "Manage" offers this viewer. Editing sits in the header (Step 62),
  // so for some viewers nothing is left there, and the section goes.
  const canReposition = !locked && canEdit && !!person?.photo_url;
  const canClaim = !isSelf && claimable && !person?.claim_status;
  const lockedNote = !canEdit && !claimable && !isSelf;
  const canDispute = person?.claim_status === "approved" && isCreator;
  const showManage =
    !locked &&
    (canReposition ||
      canClaim ||
      canDelete ||
      canInviteToClaim ||
      claimInvites.length > 0 ||
      lockedNote ||
      canDispute ||
      person?.claim_status === "disputed");

  // Reset the inline dispute form whenever a different person is selected.
  if (person?.id !== prevId) {
    setPrevId(person?.id);
    setDisputing(false);
    setReason("");
    setPhotoOpen(false);
    setAddingCompanion(false);
    setCropOpen(false);
    setCrop(savedCrop);
    setClaimEmail("");
    // What went wrong for the last one goes with them.
    cropSave.setError(null);
    invite.setError(null);
    dispute.setError(null);
  }

  function onSaveCrop() {
    if (!person) return;
    const personId = person.id;
    cropSave.run("save", () => setPersonPhotoCrop(personId, crop), {
      onSuccess: () => setCropOpen(false),
    });
  }

  function onSendClaimInvite() {
    if (!person) return;
    const personId = person.id;
    // An invite whose email failed is still made, and listed: the action
    // draws the page again whether or not the email went.
    invite.run("send", () => sendClaimInvite(personId, claimEmail), {
      success: (res) => `Invite sent to ${res.email ?? "them"}.`,
      onSuccess: () => {
        setClaimEmail("");
        // Emptied, the box disables its button, and focus goes back to the
        // box for another address, once it's no longer disabled itself.
        returnFocus(() =>
          claimEmailRef.current?.disabled ? null : claimEmailRef.current,
        );
      },
    });
  }

  function onDispute() {
    if (!person?.claim_id) return;
    const claimId = person.claim_id;
    dispute.run("send", () => disputeClaim(claimId, reason), {
      success: "Dispute sent to a Root.",
      onSuccess: () => {
        setDisputing(false);
        onClose();
      },
    });
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
        keepMounted={minimized}
        finalFocus={minimized ? minimizedFocus : undefined}
        className="w-full gap-0 overflow-y-auto sm:max-w-md"
      >
        {person ? (
          <>
            {/* Beside the close button, and on the photo like it when there
                is one (Step 49). */}
            {onMinimize ? (
              person.photo_url ? (
                <button
                  type="button"
                  onClick={onMinimize}
                  aria-label="Minimize"
                  title="Minimize"
                  className="absolute top-3 right-13 z-10 flex size-8 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-colors hover:bg-black/65 focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:outline-none"
                >
                  <Minimize2 aria-hidden className="size-4" />
                </button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={onMinimize}
                  aria-label="Minimize"
                  title="Minimize"
                  className="absolute top-3 right-11"
                >
                  <Minimize2 aria-hidden />
                </Button>
              )
            ) : null}
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
                    carry it whatever the picture underneath is doing. Its
                    middle stop is 48px down from the top rather than halfway,
                    so a maiden name under the name, a line taller, leaves
                    the name as much shade as ever. */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/45 via-[calc(100%-48px)] to-transparent px-4 pt-10 pb-3 text-left">
                    <p className="font-heading truncate text-base font-medium text-white">
                      {personDisplayName(person)}
                    </p>
                    {maiden ? (
                      <p className="truncate text-sm text-white/80">{maiden}</p>
                    ) : null}
                    <p className="truncate text-sm text-white/80">
                      {lifeLine}
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
                      but they are on the photo now, inside a button that
                      speaks only its label. */}
                  <SheetTitle className="sr-only">
                    {personDisplayName(person)}
                  </SheetTitle>
                  {maiden ? <p className="sr-only">{maiden}</p> : null}
                  <SheetDescription className="sr-only">
                    {lifeLine}
                  </SheetDescription>
                </>
              ) : (
                // Clear of the minimize and close buttons.
                <div className="flex items-center gap-3 pr-16">
                  <Avatar size="lg">
                    <AvatarFallback>{personInitials(person)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <SheetTitle className="truncate">
                      {personDisplayName(person)}
                    </SheetTitle>
                    {maiden ? (
                      <p className="text-sm text-muted-foreground">{maiden}</p>
                    ) : null}
                    <SheetDescription>
                      {lifeLine}
                      {isSelf ? " · Your entry" : ""}
                    </SheetDescription>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 empty:hidden">
                {person.is_deceased ? (
                  <Badge variant="secondary">Deceased</Badge>
                ) : null}
                {person.open_flag_count > 0 ? (
                  <Badge variant="destructive">
                    {countOf(person.open_flag_count, "open flag")}
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
              {/* Up here rather than under Manage at the foot of the sheet,
                  so it's found without scrolling (Step 62). Anyone who can't
                  edit it can suggest a change (Step 67). */}
              {!locked ? (
                <div className="flex flex-wrap gap-2">
                  {canEdit || fillable ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={editPersonHref(person.id)} />}
                      variant="outline"
                      size="sm"
                    >
                      <Pencil aria-hidden />
                      {canEdit ? "Edit entry" : "Fill in what’s missing"}
                    </Button>
                  ) : null}
                  {!canEdit ? (
                    <Button
                      nativeButton={false}
                      render={<Link href={suggestChangeHref(person.id)} />}
                      variant="outline"
                      size="sm"
                    >
                      <Lightbulb aria-hidden />
                      Suggest a change
                    </Button>
                  ) : null}
                </div>
              ) : null}
              {addRelativeOf && !readOnly ? (
                <AddRelativeButton
                  relatedTo={addRelativeOf}
                  className="w-full sm:hidden"
                />
              ) : null}
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              {connectionPrompt}
              {waiting ? (
                <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                  {waiting}
                </p>
              ) : null}
              {!locked ? (
                <EntrySuggestions
                  suggestions={changeSuggestions}
                  declined={declinedSuggestions}
                  entry={person}
                />
              ) : null}
              {!readOnly ? (
                <PersonTrees personId={person.id} currentTreeId={treeId} />
              ) : null}
              {basic ? (
                <dl className="grid grid-cols-2 gap-4">
                  <Field label="First name" value={person.first_name} />
                  <Field label="Preferred name" value={person.preferred_name} />
                  <Field label="Last name" value={person.last_name} />
                  <PlaceField
                    label="Place of birth"
                    place={
                      [person.city_of_birth, person.country_of_birth]
                        .filter(Boolean)
                        .join(", ") || null
                    }
                    placeId={person.place_id_birth}
                    shareToken={shareToken}
                  />
                </dl>
              ) : (
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
                    asDayMonth(person.birth_month, person.birth_day),
                    person.date_of_birth_circa,
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
                        null,
                        person.date_of_death_circa,
                      )}
                    />
                    <PlaceField
                      label="Place of death"
                      place={
                        person.death_place_historical || person.place_of_death
                      }
                      placeId={person.place_id_death}
                      shareToken={shareToken}
                    />
                  </>
                ) : null}
              </dl>
              )}

              {!basic && (canEdit || fillable) && !person.maiden_name ? (
                <div className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-xs text-muted-foreground">
                  No maiden name yet.
                </div>
              ) : null}

              <FamilySection
                relations={relations}
                onChanged={() => undefined}
              />

              <CompanionsSection
                pets={pets}
                canAdd={!locked && canEdit}
                onSelectPet={onSelectPet}
                onAdd={() => setAddingCompanion(true)}
              />

              <PendingConnectionPrompts
                suggestions={suggestions}
                onResolved={() => undefined}
              />

              {!locked ? (
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
                        Private to this entry&rsquo;s owner, its Branch and the
                        Roots.
                      </p>
                    </div>
                  )}
                </section>
              ) : null}

              {!locked ? (
                <section className="border-t border-border pt-5">
                  <EntryComments
                    personId={person.id}
                    treeId={treeId}
                    currentUserId={currentUserId}
                    canModerate={canEdit}
                  />
                </section>
              ) : null}

              {showManage ? (
                <section className="flex flex-col gap-3 border-t border-border pt-5">
                  <h2 className="text-sm font-semibold">Manage</h2>

                  <div className="flex flex-wrap gap-2 empty:hidden">
                    {canReposition ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCrop(savedCrop);
                          cropSave.setError(null);
                          setCropOpen(true);
                        }}
                      >
                        Reposition photo
                      </Button>
                    ) : null}

                    {/* Claiming merges the viewer's own entry into this one
                        and deletes it, so it asks first (Step 36). */}
                    {canClaim ? (
                      <ConfirmButton
                        size="sm"
                        confirm={{
                          title: "Make this your entry?",
                          description: claimNote ?? undefined,
                          confirmLabel: "Yes, merge",
                          pendingLabel: "Merging…",
                          onConfirm: () => claimPerson(person.id),
                          success: "Merged — this is now your entry.",
                          onSuccess: onClose,
                        }}
                      >
                        This is me — claim it
                      </ConfirmButton>
                    ) : null}

                    {canDelete ? (
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        confirm={{
                          title: `Delete ${personDisplayName(person)}?`,
                          description:
                            "Their connections, photo and documents go too.\nThis cannot be undone.",
                          confirmLabel: "Delete",
                          pendingLabel: "Deleting…",
                          onConfirm: () => deletePerson(person.id),
                          onSuccess: onClose,
                          // The sheet closes and their card is gone: focus
                          // goes on to Add a relative rather than the page.
                          fallbackFocus: () =>
                            document.querySelector<HTMLElement>(
                              "[data-add-relative]",
                            ),
                        }}
                      >
                        Delete entry
                      </ConfirmButton>
                    ) : null}
                  </div>

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
                          ref={claimEmailRef}
                          id="claim-invite-email"
                          type="email"
                          inputMode="email"
                          autoComplete="off"
                          className="min-w-[12rem] flex-1"
                          value={claimEmail}
                          onChange={(e) => setClaimEmail(e.target.value)}
                          placeholder="them@example.com"
                          disabled={invite.pending}
                        />
                        <PendingButton
                          size="sm"
                          onClick={onSendClaimInvite}
                          pending={invite.pending}
                          disabled={claimEmail.trim().length === 0}
                          pendingLabel="Sending…"
                        >
                          {claimInvites.some((i) => i.live)
                            ? "Send another"
                            : "Send invite"}
                        </PendingButton>
                      </div>
                      <FormError>{invite.error}</FormError>
                      <JoinsAsNote />
                      <p className="text-xs text-muted-foreground">
                        They&rsquo;ll get a link, good for{" "}
                        {INVITE_LIFETIME_DAYS} days, to take over this entry.
                      </p>
                    </div>
                  ) : claimInvites.length > 0 ? (
                    // Everyone else on the tree still sees that it's in hand.
                    <ClaimInviteRecords invites={claimInvites} />
                  ) : null}

                  {lockedNote ? (
                    <p className="text-xs text-muted-foreground">
                      {fillable ? FILL_ENTRY_NOTE : LOCKED_ENTRY_NOTE}
                    </p>
                  ) : null}

                  {canDispute ? (
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
                        <FormError>{dispute.error}</FormError>
                        <div className="flex gap-2">
                          <PendingButton
                            size="sm"
                            onClick={onDispute}
                            pending={dispute.pending}
                            pendingLabel="Sending…"
                          >
                            Send dispute
                          </PendingButton>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              returnFocus(() => disputeLinkRef.current);
                              setDisputing(false);
                              dispute.setError(null);
                            }}
                            disabled={dispute.pending}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button
                        ref={disputeLinkRef}
                        type="button"
                        className="relative tap-target self-start text-xs text-destructive underline underline-offset-2"
                        onClick={() => {
                          setDisputing(true);
                          // The link makes way for the form: its box takes
                          // focus.
                          returnFocus(() =>
                            document.getElementById("dispute-reason"),
                          );
                        }}
                      >
                        You created this entry — dispute the claim
                      </button>
                    )
                  ) : null}

                  {person.claim_status === "disputed" ? (
                    <p className="text-xs text-muted-foreground">
                      A dispute over this entry is with a Root.
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
                        toastError("That photo couldn't be loaded.");
                        setCropOpen(false);
                      }}
                    />
                    <FormError>{cropSave.error}</FormError>
                    <div className="flex gap-2">
                      <PendingButton
                        size="sm"
                        onClick={onSaveCrop}
                        pending={cropSave.pending}
                        pendingLabel="Saving…"
                      >
                        Save
                      </PendingButton>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setCrop(savedCrop);
                          setCropOpen(false);
                        }}
                        disabled={cropSave.pending}
                      >
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCrop(DEFAULT_CROP)}
                        disabled={cropSave.pending}
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
