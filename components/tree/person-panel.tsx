"use client";

import * as React from "react";
import Link from "next/link";
import {
  Flag,
  Lightbulb,
  Loader2Icon,
  Mail,
  Minimize2,
  Pencil,
  UserPlus,
} from "lucide-react";

import { claimPerson } from "@/app/actions/claims";
import { switchTreeForm } from "@/app/actions/current-tree";
import { sendClaimInvite } from "@/app/actions/invites";
import { setPersonPhotoCrop } from "@/app/actions/people";
import { deletePerson } from "@/app/actions/privacy";
import { describeClaimInvite, type EntryInvite } from "@/lib/claim-invites";
import type { Relation } from "@/lib/connection-path";
import type { PanelSuggestion } from "@/lib/connection-suggestions";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AncestralLands } from "@/components/ancestral-lands";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { lazyComponent, whenIdle } from "@/components/lazy-component";
import { PhotoCropEditor } from "@/components/lazy-photo-crop-editor";
import { PendingButton } from "@/components/pending-button";
import { PendingConnectionPrompts } from "@/components/tree/connection-prompts";
import { CompanionsSection } from "@/components/tree/person-companions";
import {
  FamilySection,
  type PersonRelation,
} from "@/components/tree/person-family";
import { AddRelativeButton } from "@/components/tree/add-relative-button";
import { FamilyAddButton, type FamilyAdd } from "@/components/tree/add-to-tree";
import type { CompanionOption } from "@/components/tree/companion-picker";
import { EntryAlbum } from "@/components/tree/entry-album";
import { EntryStories } from "@/components/tree/entry-stories";
import { EntryReports } from "@/components/tree/entry-reports";
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
import { useDockedSheet } from "@/components/use-docked-sheet";
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
import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import { FILL_ENTRY_NOTE, LOCKED_ENTRY_NOTE } from "@/lib/account-types";
import { BASIC_DETAILS, NAME_ONLY, waitingOn } from "@/lib/carry";
import { blankFields } from "@/lib/fill-blanks";
import { SEX_LABELS, type Sex } from "@/lib/person-labels";
import { PersonOnTrees, PersonTrees } from "@/components/tree/person-trees";
import { HeldBackDetails } from "@/components/tree/held-back-details";
import { useLoadPersonSheet } from "@/components/tree/use-person-sheet";
import { joinedByTags } from "@/lib/joined-by";
import { countOf } from "@/lib/plural";
import type { FamilyViewTree } from "@/lib/my-family";
import type { DeclinedSuggestion, EntrySuggestion } from "@/lib/suggestions";
import { editPersonHref, suggestChangeHref } from "@/lib/tree-links";
import { cn } from "@/lib/utils";
import type { TreePet } from "@/lib/pets";
import type { TreeGraphPerson } from "@/lib/tree";

// Dialogs the sheet opens on a tap (Step 87.4, audit C1), fetched once the
// sheet is mounted and the browser is idle, so they're here before it opens.
const ReportDialog = lazyComponent(() =>
  import("@/components/tree/report-dialog").then((m) => m.ReportDialog),
);
const AddCompanionDialog = lazyComponent(() =>
  import("@/components/tree/add-companion-dialog").then(
    (m) => m.AddCompanionDialog,
  ),
);

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
 * A link drawn like the badges it sits beside, the account type tag's size
 * (Step 88.1), with a whole 44px to press on a touch screen.
 */
function TagLink({
  href,
  title,
  children,
}: {
  href: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      render={<Link href={href} title={title} />}
      className="relative tap-target overflow-visible"
    >
      {children}
    </Badge>
  );
}

/**
 * `TagLink` to a page on another tree than the one the browser remembers
 * (Step 92.3: from My Family Tree, a card's own): a button that switches
 * to that tree first and stays busy until the page arrives, as
 * `TreeTarget` does. On the remembered tree it's the plain link.
 */
function TagTreeLink({
  treeId,
  currentTreeId,
  href,
  title,
  icon,
  children,
}: {
  treeId: string;
  currentTreeId: string | null;
  href: string;
  title?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const go = useAction();
  if (treeId === currentTreeId) {
    return (
      <TagLink href={href} title={title}>
        {icon}
        {children}
      </TagLink>
    );
  }
  return (
    <Badge
      variant="outline"
      render={
        <button
          type="button"
          title={title}
          disabled={go.pending}
          aria-busy={go.pending || undefined}
          onClick={() => go.run("open", () => switchTreeForm(treeId, href))}
        />
      }
      className="relative tap-target overflow-visible hover:bg-muted hover:text-muted-foreground disabled:opacity-70"
    >
      {go.pending ? <Loader2Icon aria-hidden className="animate-spin" /> : icon}
      {children}
    </Badge>
  );
}

/** A button drawn like `TagLink` beside it. */
function TagButton({
  title,
  onClick,
  children,
}: {
  /** Its name, for a button that shows only an icon. */
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      render={
        <button
          type="button"
          onClick={onClick}
          aria-label={title}
          title={title}
        />
      }
      className="relative tap-target overflow-visible hover:bg-muted hover:text-muted-foreground"
    >
      {children}
    </Badge>
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

function PersonPanelImpl({
  person,
  treeId,
  pets,
  people,
  onSelectPet,
  describeConnection,
  suggestions,
  relations,
  isAdmin,
  isSelf,
  canEdit,
  canFill = false,
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
  onTrees = null,
  currentTreeId = null,
  familyAdd = null,
  addRelativeOf = null,
  connectionPrompt = null,
  samePerson = null,
  kinship = null,
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
  /** What one person is to another on this canvas (Step 99: a story
   *  credit's card). */
  describeConnection?: (fromId: string, toId: string) => Relation | null;
  /** View-only (a share link, or a visitor) — hide every editing / moderation affordance. */
  readOnly?: boolean;
  /** On a share link: how its cards ask whose land a place is (Step 27.9). */
  shareToken?: string | null;
  /**
   * On My Family Tree (Step 92.2): every one of the viewer's trees showing
   * them, named in place of "Also on", and the tree the browser is looking
   * at, which its link opens without a switch.
   */
  onTrees?: FamilyViewTree[] | null;
  currentTreeId?: string | null;
  /**
   * On My Family Tree (Step 92.3), where its "Add a relative" goes: which
   * of the viewer's trees, asked when there's a choice. `treeId` is then
   * the card's own tree, where what's done from the sheet goes.
   */
  familyAdd?: FamilyAdd | null;
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
  /** On My Family Tree, "Same person as …?" when another card may be them
   *  too (Step 92.4): above the trees they're on. */
  samePerson?: React.ReactNode;
  /**
   * On My Family Tree (Step 94), whether they're a direct relative of the
   * viewer, their spouse (94.1) or married in, and then to whom ("Spouse of
   * Karim"): said outright among the badges. Never on the viewer's own
   * entry.
   */
  kinship?: { label: string; detail?: string } | null;
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
  useDockedSheet(open);
  // A handle each, so one running leaves the others alone: pressing Delete
  // entry no longer shows the invite as sending (Step 70). Claim and Delete
  // ask first, and their dialogs carry their own.
  const cropSave = useAction({ inline: true });
  const invite = useAction({ inline: true });
  // The sheet is non-modal, so nothing else keeps focus as its inline forms
  // open and close.
  const returnFocus = useFocusReturn();
  const claimEmailRef = React.useRef<HTMLInputElement>(null);
  const [reporting, setReporting] = React.useState(false);
  const [photoOpen, setPhotoOpen] = React.useState(false);
  const [addingCompanion, setAddingCompanion] = React.useState(false);
  const [cropOpen, setCropOpen] = React.useState(false);
  const [claimEmail, setClaimEmail] = React.useState("");
  // Family and Companions start folded (Step 88.1). Opened, they stay open
  // as the reader moves from one relative to the next, until the details
  // close.
  const [familyOpen, setFamilyOpen] = React.useState(false);
  const [companionsOpen, setCompanionsOpen] = React.useState(false);
  const savedCrop = parseCrop(person?.photo_crop);
  React.useEffect(
    () =>
      whenIdle(() => {
        for (const lazy of [ReportDialog, AddCompanionDialog, PhotoCropEditor])
          lazy.preload().catch(() => {});
      }),
    [],
  );
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [prevId, setPrevId] = React.useState(person?.id);
  // Under the name in the header, as on the person's card and leaf.
  const maiden = person ? maidenLine(person) : null;
  // A basic card (Step 80) is a name and a place of birth: nothing to edit,
  // fill in, comment on or manage from this tree.
  const basic = !!person?.basic;
  const locked = readOnly || basic;
  // A placeholder child (Step 98.2) has nothing to show until their parent
  // fills it in, and nothing anyone else can add to it.
  const placeholder = person?.placeholder_number != null;
  const sealed = locked || placeholder;
  // On My Family Tree (Step 92.3): its pages open on the card's own tree,
  // switched to first, and come back to the view; its companions only show.
  const inView = onTrees !== null;
  // What the sections below show beyond the card, in one read as the sheet
  // opens (Step 87.6): "Also on" unless the tree is read-only, and reports,
  // the album and stories where the entry is open to this viewer.
  // Minimized, they stay mounted, so still read.
  useLoadPersonSheet(person?.id ?? null, {
    // On My Family Tree the sheet names their trees itself (`onTrees`).
    trees: !readOnly && !inView,
    album: !sealed,
    stories: !sealed,
    reports: locked ? 0 : (person?.open_report_count ?? 0),
    // What's held back of a placeholder: its parent's, or the child's own
    // (Step 98.3).
    heldBack: placeholder && !locked && (canEdit || isSelf),
  });
  const waiting = person
    ? waitingOn(person.approval, person.asked_of, personDisplayName(person))
    : null;
  // With no dates to show, a basic card says what it is instead, and so
  // does a name-only one (Step 106).
  const lifeLine = person
    ? basic
      ? person.approval === "shell"
        ? NAME_ONLY
        : BASIC_DETAILS
      : placeholder
        ? "Placeholder"
        : (personLifespan(person) ?? "Living")
    : "";
  // Something here is blank, and the viewer may fill it in (Step 44).
  const fillable =
    !!person && canFill && !locked && blankFields(person).length > 0;
  // What "Manage" offers this viewer. Editing sits in the header (Step 62),
  // so for some viewers nothing is left there, and the section goes.
  const canReposition = !locked && canEdit && !!person?.photo_url;
  const canClaim = !isSelf && claimable && !person?.claim_status;
  const lockedNote = !canEdit && !claimable && !isSelf && !placeholder;
  // Whoever added an entry someone has claimed may dispute the claim, in
  // the report dialog (Step 88.2).
  const canDispute = person?.claim_status === "approved" && isCreator;
  // A problem with an entry is reported by whoever can't put it right
  // themselves, or has a claim to dispute.
  const canReport = !locked && (!canEdit || canDispute);
  const joinedTags = locked
    ? []
    : joinedByTags(person?.joined_by ?? null, currentUserId);
  const showManage =
    !locked &&
    (canReposition ||
      canClaim ||
      canDelete ||
      canInviteToClaim ||
      claimInvites.length > 0 ||
      lockedNote);

  // Claiming merges the viewer's own entry into this one and deletes it, so
  // it asks first (Step 36). A basic card offers it too (Step 83): claiming
  // it here is their yes to showing it here.
  const claimButton =
    person && canClaim && !readOnly ? (
      <ConfirmButton
        size="sm"
        confirm={{
          title: "Make this your entry?",
          description: claimNote ?? undefined,
          confirmLabel: "yes, merge",
          pendingLabel: "merging…",
          onConfirm: () => claimPerson(person.id),
          success: "Merged — this is now your entry.",
          onSuccess: onClose,
        }}
      >
        this is me — claim it
      </ConfirmButton>
    ) : null;

  // Nobody is behind this entry yet, and it is the viewer's to hand over
  // (`canInviteToClaim`): theirs to edit, or a card their tree shows and
  // they're its Root (Step 84). The server asks the database the same thing
  // before minting the link.
  const inviteToClaim = !person ? null : canInviteToClaim ? (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <Label htmlFor="claim-invite-email" className="text-xs font-medium">
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
          pendingLabel="sending…"
        >
          {claimInvites.some((i) => i.live) ? "send another" : "send invite"}
        </PendingButton>
      </div>
      <FormError>{invite.error}</FormError>
      <JoinsAsNote />
      <p className="text-xs text-muted-foreground">
        They&rsquo;ll get a link, good for {INVITE_LIFETIME_DAYS} days, to take
        over this entry.
      </p>
    </div>
  ) : claimInvites.length > 0 ? (
    // Everyone else on the tree still sees that it's in hand.
    <ClaimInviteRecords invites={claimInvites} />
  ) : null;

  // A different person: what was open for the last one closes.
  if (person?.id !== prevId) {
    setPrevId(person?.id);
    setReporting(false);
    setPhotoOpen(false);
    setAddingCompanion(false);
    setCropOpen(false);
    setCrop(savedCrop);
    setClaimEmail("");
    if (!person) {
      setFamilyOpen(false);
      setCompanionsOpen(false);
    }
    // What went wrong for the last one goes with them.
    cropSave.setError(null);
    invite.setError(null);
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
    // They join the tree it's sent from, which shows the entry (Step 84).
    invite.run("send", () => sendClaimInvite(personId, claimEmail, treeId), {
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

  return (
    // Non-modal, with no scrim: the canvas behind is doing the work of showing
    // this person's own tree lit against the blurred rest of the family, and a
    // backdrop would blur the spotlight away along with everything else. It
    // stays live too, so clicking another relative moves the spotlight onto
    // them rather than only dismissing the panel. `useDockedSheet` moves the
    // site header aside while it's open (globals.css).
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
        className="gap-0 overflow-y-auto"
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
              {/* The edit button sits at the end of the badges, the account
                  type tag's size (Step 88.1; in the header since Step 62, so
                  it's found without scrolling). Anyone who can't edit the
                  entry can suggest a change (Step 67), or report a problem
                  with it (Step 88.2). */}
              <div className="flex flex-wrap items-center gap-1.5 empty:hidden">
                {kinship ? (
                  <Badge variant="outline" title={kinship.detail}>
                    {kinship.label}
                  </Badge>
                ) : null}
                {person.is_deceased ? (
                  <Badge variant="secondary">Deceased</Badge>
                ) : null}
                {person.open_report_count > 0 ? (
                  <Badge variant="destructive">
                    {countOf(person.open_report_count, "report")}
                  </Badge>
                ) : null}
                {person.claim_status === "approved" ? (
                  <Badge variant="outline">Claimed</Badge>
                ) : null}
                {person.account_type ? (
                  <AccountTypeBadge role={person.account_type} />
                ) : null}
                {isAdmin && person.lineage_type ? (
                  <Badge variant="outline">
                    Lineage: {person.lineage_type}
                  </Badge>
                ) : null}
                {!locked ? (
                  <span className="ml-auto flex gap-1.5">
                    {canEdit || fillable ? (
                      inView ? (
                        <TagTreeLink
                          treeId={treeId}
                          currentTreeId={currentTreeId}
                          href={editPersonHref(person.id, { fromFamily: true })}
                          title={canEdit ? undefined : "Fill in what’s missing"}
                          icon={<Pencil aria-hidden />}
                        >
                          {canEdit && !placeholder ? "edit" : "fill in"}
                        </TagTreeLink>
                      ) : (
                        <TagLink
                          href={editPersonHref(person.id)}
                          title={canEdit ? undefined : "Fill in what’s missing"}
                        >
                          <Pencil aria-hidden />
                          {canEdit && !placeholder ? "edit" : "fill in"}
                        </TagLink>
                      )
                    ) : null}
                    {!canEdit && !placeholder ? (
                      inView ? (
                        <TagTreeLink
                          treeId={treeId}
                          currentTreeId={currentTreeId}
                          href={suggestChangeHref(person.id, undefined, {
                            fromFamily: true,
                          })}
                          title="Suggest a change"
                          icon={<Lightbulb aria-hidden />}
                        >
                          suggest
                        </TagTreeLink>
                      ) : (
                        <TagLink
                          href={suggestChangeHref(person.id)}
                          title="Suggest a change"
                        >
                          <Lightbulb aria-hidden />
                          suggest
                        </TagLink>
                      )
                    ) : null}
                    {canReport ? (
                      <TagButton
                        title="Report a problem"
                        onClick={() => setReporting(true)}
                      >
                        <Flag aria-hidden />
                      </TagButton>
                    ) : null}
                  </span>
                ) : null}
              </div>
              {placeholder ? null : familyAdd ? (
                // From the person on My Family Tree: the trees showing them
                // where the viewer may add (Step 92.3).
                familyAdd.relatedTo ? (
                  <FamilyAddButton add={familyAdd} className="w-full sm:hidden" />
                ) : null
              ) : addRelativeOf && !readOnly ? (
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
              {placeholder ? (
                canEdit || isSelf ? (
                  <HeldBackDetails
                    personId={person.id}
                    name={personDisplayName(person)}
                    asParent={canEdit}
                  />
                ) : (
                  <p className="rounded-md border border-dashed border-border bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
                    Only their parent can fill this in.
                  </p>
                )
              ) : null}
              {basic && claimButton ? <div>{claimButton}</div> : null}
              {basic && !readOnly ? inviteToClaim : null}
              {!locked ? (
                <EntrySuggestions
                  suggestions={changeSuggestions}
                  declined={declinedSuggestions}
                  entry={person}
                  onTree={
                    inView ? { id: treeId, currentTreeId } : null
                  }
                />
              ) : null}
              {!locked ? (
                <EntryReports
                  personId={person.id}
                  personName={personDisplayName(person)}
                  count={person.open_report_count}
                  canEdit={canEdit}
                  canDecide={isAdmin && person.is_home}
                />
              ) : null}
              {samePerson}
              {onTrees ? (
                <PersonOnTrees
                  personId={person.id}
                  trees={onTrees}
                  currentTreeId={currentTreeId}
                />
              ) : !readOnly ? (
                <PersonTrees personId={person.id} currentTreeId={treeId} />
              ) : null}
              {placeholder ? null : basic ? (
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

              <PendingConnectionPrompts
                suggestions={suggestions}
                onResolved={() => undefined}
              />

              {/* The album (Step 88.5), where documents were: not on a
                  share link or to a visitor, and not on a basic card. */}
              {!sealed ? (
                <section className="border-t border-border pt-5">
                  <EntryAlbum
                    personId={person.id}
                    treeId={treeId}
                    people={people}
                  />
                </section>
              ) : null}

              {/* Stories (Step 88.3), where the comments board was: not on
                  a share link or to a visitor, and not on a basic card. */}
              {!sealed ? (
                <section className="border-t border-border pt-5">
                  <EntryStories
                    people={people}
                    personName={personDisplayName(person)}
                    describeConnection={describeConnection}
                    personId={person.id}
                    treeId={treeId}
                    canEdit={canEdit}
                  />
                </section>
              ) : null}

              {/* Family and Companions come after the album and stories
                  (Aalim, Step 88.5). */}
              <FamilySection
                relations={relations}
                onChanged={() => undefined}
                open={familyOpen}
                onOpenChange={setFamilyOpen}
              />

              <CompanionsSection
                pets={pets}
                // On My Family Tree companions only show (Step 92.3): a pet
                // lives on one tree, which the view doesn't say.
                canAdd={!sealed && !inView && canEdit}
                onSelectPet={onSelectPet}
                onAdd={() => setAddingCompanion(true)}
                open={companionsOpen}
                onOpenChange={setCompanionsOpen}
              />

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
                        reposition photo
                      </Button>
                    ) : null}

                    {claimButton}

                    {canDelete ? (
                      <ConfirmButton
                        size="sm"
                        variant="outline"
                        className="text-destructive"
                        confirm={{
                          title: `Delete ${personDisplayName(person)}?`,
                          description:
                            "Their connections, photos and stories go too.\nThis cannot be undone.",
                          confirmLabel: "delete",
                          pendingLabel: "deleting…",
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
                        delete entry
                      </ConfirmButton>
                    ) : null}
                  </div>

                  {inviteToClaim}

                  {lockedNote ? (
                    <p className="text-xs text-muted-foreground">
                      {fillable ? FILL_ENTRY_NOTE : LOCKED_ENTRY_NOTE}
                    </p>
                  ) : null}
                </section>
              ) : null}

              {/* How they came onto the tree, last (Step 86): who added the
                  entry and who invited them, both when they differ. */}
              {joinedTags.length > 0 ? (
                <footer className="flex flex-wrap gap-1.5 border-t border-border pt-4">
                  {joinedTags.map((tag) => (
                    <Badge
                      key={tag.label}
                      variant="outline"
                      className="max-w-full font-normal text-muted-foreground"
                    >
                      {tag.kind === "added" ? (
                        <UserPlus aria-hidden />
                      ) : (
                        <Mail aria-hidden />
                      )}
                      <span className="truncate">{tag.label}</span>
                    </Badge>
                  ))}
                </footer>
              ) : null}
            </div>

            {canReport ? (
              <ReportDialog
                open={reporting}
                onOpenChange={setReporting}
                personId={person.id}
                treeId={treeId}
                canDispute={canDispute}
              />
            ) : null}

            {!readOnly && !inView && canEdit ? (
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
                        pendingLabel="saving…"
                      >
                        save
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
                        cancel
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCrop(DEFAULT_CROP)}
                        disabled={cropSave.pending}
                      >
                        reset
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

/**
 * Handed only what it needs, each kept while it stays the same, so the sheet
 * doesn't draw again for what only changes the canvas (Step 87.2, audit C4).
 */
export const PersonPanel = React.memo(PersonPanelImpl);
