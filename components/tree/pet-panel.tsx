"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  addPetCompanion,
  removePet,
  removePetCompanion,
  setPetPrimaryCompanion,
  updatePet,
} from "@/app/actions/pets";
import { AncestralLands } from "@/components/ancestral-lands";
import { ConfirmButton } from "@/components/confirm-dialog";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionFields } from "@/components/tree/companion-fields";
import {
  CompanionPicker,
  type CompanionOption,
} from "@/components/tree/companion-picker";
import { PetComments } from "@/components/tree/pet-comments";
import { PhotoPicker } from "@/components/photo-picker";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toastError, useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import { usePhotoDraft } from "@/components/use-photo-draft";
import { UNREACHABLE } from "@/lib/action-feedback";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  formatPetBirthday,
  petBirthplace,
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  type PetSpecies,
} from "@/lib/pet-labels";
import { petSchema, type PetFormValues } from "@/lib/pet-schema";
import type { TreePet } from "@/lib/pets";
import { discardPhoto, uploadPhoto } from "@/lib/photo-upload";

const toFormValues = (pet: TreePet): PetFormValues => ({
  name: pet.name,
  species: pet.species as PetSpecies,
  species_label: pet.species_label ?? "",
  year_born: pet.year_born ? String(pet.year_born) : "",
  birth_date: pet.birth_date ?? "",
  place_id_birth: pet.place_id_birth ?? null,
  city_of_birth: pet.city_of_birth ?? "",
  country_of_birth: pet.country_of_birth ?? "",
  is_deceased: pet.is_deceased,
  year_died: pet.year_died ? String(pet.year_died) : "",
});

const NO_COMPANIONS: string[] = [];

/**
 * `useOptimistic` for something of the companion that's open, so a change
 * still on its way for one companion never shows on the next one opened
 * (the sheet stays up while another is picked on the canvas).
 */
function useOptimisticFor<T>(petId: string | undefined, value: T) {
  const [state, setState] = React.useOptimistic({ petId, value });
  const shown = state.petId === petId ? state.value : value;
  return [shown, (next: T) => setState({ petId, value: next })] as const;
}

/**
 * Editing a companion's details and photo. Mounted only while it's open, so
 * a closed sheet, or one just being read, runs no form (Step 87.2, audit
 * C4); closing it drops whatever was half typed.
 */
function PetEditForm({
  pet,
  treeId,
  isAdmin,
  onDone,
}: {
  pet: TreePet;
  treeId: string;
  isAdmin: boolean;
  /** Saved, or cancelled. */
  onDone: () => void;
}) {
  const photo = usePhotoDraft(parseCrop(pet.photo_crop));
  const form = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    mode: "onChange",
    defaultValues: toFormValues(pet),
  });
  const edit = useAction({ inline: true });

  function onSave(values: PetFormValues) {
    const petId = pet.id;
    const { file, crop } = photo;
    // Reposition on the photo it has, with no new one: saved on its own
    // (Step 77.4) — it used to be dropped.
    const reframed = !!pet.photo_path && photo.reframed;
    edit.run(
      "save",
      async () => {
        // The file goes up first, then the details and the photo are saved
        // together (Step 77.5).
        let path: string | null = null;
        if (file) {
          try {
            path = await uploadPhoto({ kind: "pet", treeId, petId }, file);
          } catch {
            toast.warning(
              "The photo didn't upload — other changes still saved.",
            );
          }
        }
        const result = await updatePet(
          petId,
          values,
          path ? { path, crop } : reframed ? { crop } : null,
        );
        if (result.error && path) await discardPhoto(path);
        return result;
      },
      {
        onSuccess: onDone,
      },
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={(event) => void form.handleSubmit(onSave)(event)}
        className="flex flex-col gap-5"
      >
        <CompanionFields
          control={form.control}
          idPrefix={`pet-${pet.id}`}
          isAdmin={isAdmin}
        />
        <PhotoPicker
          id={`pet-photo-${pet.id}`}
          {...photo.picker}
          currentUrl={pet.photo_url}
          label="Photo"
          disabled={edit.pending}
        />
        <FormError>{edit.error}</FormError>
        <div className="flex gap-2">
          <PendingButton
            type="submit"
            size="sm"
            pending={edit.pending}
            pendingLabel="Saving…"
            disabled={photo.busy}
          >
            Save
          </PendingButton>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={edit.pending}
            onClick={onDone}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}

/** Whether an event came from a toast (the Toaster's own region). */
function inToast(target: EventTarget | null | undefined): boolean {
  return target instanceof Element && !!target.closest("[data-sonner-toaster]");
}

/**
 * A companion's detail sheet.
 *
 * Where a person's panel carries claims, comments, flags, documents and
 * lineage, this carries a name, an animal, a couple of years, a photo, and
 * the people it belongs to. That gap is the feature: a
 * companion is a warm footnote on the tree, not another record to maintain.
 */
function PetPanelImpl({
  pet,
  treeId,
  people,
  canEdit,
  currentUserId,
  isAdmin,
  readOnly = false,
  shareToken = null,
  onClose,
  onSelectPerson,
}: {
  pet: TreePet | null;
  treeId: string;
  /** Everyone on the canvas, for linking this companion to more of them. */
  people: CompanionOption[];
  canEdit: boolean;
  currentUserId: string;
  isAdmin: boolean;
  readOnly?: boolean;
  /** On a share link: how the panel asks whose land a place is (Step 27.9). */
  shareToken?: string | null;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [prevId, setPrevId] = React.useState(pet?.id);

  // A different companion selected: drop any half-finished edit.
  if (pet?.id !== prevId) {
    setPrevId(pet?.id);
    setEditing(false);
  }

  const labelById = React.useMemo(
    () => new Map(people.map((p) => [p.id, p.label])),
    [people],
  );

  // A handle each for the edit form, the links and the primary, so one of
  // them running doesn't hold up the others (Step 70).
  const links = useAction();
  const primary = useAction();
  // The chips and the Primary badge move at once; a call that fails puts
  // them back by itself.
  const [companionIds, setCompanionIds] = useOptimisticFor(
    pet?.id,
    pet?.companions ?? NO_COMPANIONS,
  );
  const [primaryId, setPrimaryId] = useOptimisticFor(
    pet?.id,
    pet?.primary_person_id ?? null,
  );
  const returnFocus = useFocusReturn();
  const editButtonRef = React.useRef<HTMLButtonElement>(null);

  // Out of the form, back to the button that opened it.
  const doneEditing = () => {
    returnFocus(() => editButtonRef.current);
    setEditing(false);
  };

  function onCompanionsChange(ids: string[]) {
    if (!pet) return;
    const petId = pet.id;
    const added = ids.find((id) => !companionIds.includes(id));
    const dropped = companionIds.find((id) => !ids.includes(id));
    if (added) {
      links.run("link", async () => {
        setCompanionIds(ids);
        return addPetCompanion(petId, added);
      });
    } else if (dropped) {
      const name = labelById.get(dropped) ?? "Someone on the tree";
      links.run(
        "link",
        async () => {
          setCompanionIds(ids);
          return removePetCompanion(petId, dropped);
        },
        {
          // Quick to put back, so it's undone rather than asked about first.
          onSuccess: () => {
            toast(`${name} unlinked.`, {
              action: {
                label: "Undo",
                onClick: () => {
                  void addPetCompanion(petId, dropped).then(
                    (r) => r?.error && toastError(r.error),
                    () => toastError(UNREACHABLE),
                  );
                },
              },
            });
          },
        },
      );
    }
  }

  function onSetPrimary(personId: string, row: HTMLElement | null) {
    if (!pet || personId === primaryId) return;
    const petId = pet.id;
    // The badge takes the link's place: focus goes to the name beside it.
    const name = row?.querySelector("button");
    if (name) returnFocus(() => name);
    primary.run("primary", async () => {
      setPrimaryId(personId);
      return setPetPrimaryCompanion(petId, personId);
    });
  }

  const glyph = pet
    ? (SPECIES_GLYPHS[pet.species as PetSpecies] ?? SPECIES_GLYPHS.other)
    : SPECIES_GLYPHS.other;

  return (
    // Docked like a person's panel: no scrim, and the page stays live, so the
    // site header moves aside and its buttons stay in reach (globals.css). A
    // click outside still closes it.
    <Sheet
      open={pet !== null}
      modal={false}
      onOpenChange={(next, details) => {
        // A toast's own button (Undo) sits outside the sheet but is about
        // what's in it: pressing it, or focus going to it, leaves the sheet
        // open (Step 70).
        if (
          !next &&
          (details.reason === "outside-press" ||
            details.reason === "focus-out") &&
          (inToast(details.event.target) ||
            inToast((details.event as FocusEvent).relatedTarget))
        ) {
          details.cancel();
          return;
        }
        if (!next) onClose();
      }}
    >
      <SheetContent
        data-docked-sheet
        showOverlay={false}
        className="gap-0 overflow-y-auto"
      >
        {pet ? (
          <>
            <SheetHeader className="gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl">
                  {pet.photo_card_url ? (
                    <img
                      src={pet.photo_card_url}
                      alt=""
                      style={cropStyle(parseCrop(pet.photo_crop))}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span aria-hidden>{glyph}</span>
                  )}
                </span>
                <div className="min-w-0">
                  <SheetTitle className="truncate">{pet.name}</SheetTitle>
                  <SheetDescription>
                    {speciesLabel(pet)}
                    {petYears(pet) ? ` · ${petYears(pet)}` : ""}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">Companion</Badge>
                {pet.is_deceased ? (
                  <Badge variant="outline">In memory</Badge>
                ) : null}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              {editing ? (
                <PetEditForm
                  key={pet.id}
                  pet={pet}
                  treeId={treeId}
                  isAdmin={isAdmin}
                  onDone={doneEditing}
                />
              ) : (
                <>
                  {formatPetBirthday(pet.birth_date) || petBirthplace(pet) ? (
                  <section className="flex flex-col gap-3">
                    <h2 className="text-sm font-semibold">Details</h2>
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                      {formatPetBirthday(pet.birth_date) ? (
                        <>
                          <dt className="text-muted-foreground">Born</dt>
                          <dd>{formatPetBirthday(pet.birth_date)}</dd>
                        </>
                      ) : null}
                      {petBirthplace(pet) ? (
                        <>
                          <dt className="text-muted-foreground">
                            Place of birth
                          </dt>
                          <dd className="flex flex-col gap-1">
                            <span>{petBirthplace(pet)}</span>
                            <AncestralLands
                              placeId={pet.place_id_birth}
                              shareToken={shareToken}
                            />
                          </dd>
                        </>
                      ) : null}
                    </dl>
                  </section>
                  ) : null}

                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">Companion to</h2>
                  <ul className="flex flex-col gap-1.5">
                    {companionIds.map((id) => {
                      const isPrimary = id === primaryId;
                      return (
                        <li
                          key={id}
                          className="flex flex-wrap items-center gap-2"
                        >
                          <button
                            type="button"
                            className="text-sm underline underline-offset-2 hover:text-foreground"
                            onClick={() => onSelectPerson(id)}
                          >
                            {labelById.get(id) ?? "Someone on the tree"}
                          </button>
                          {isPrimary ? (
                            <Badge variant="secondary">Primary</Badge>
                          ) : !readOnly && canEdit ? (
                            <button
                              type="button"
                              className="relative tap-target text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground disabled:opacity-50"
                              onClick={(event) =>
                                onSetPrimary(
                                  id,
                                  event.currentTarget.closest("li"),
                                )
                              }
                              disabled={primary.pending}
                            >
                              Make primary
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    {pet.name} sits on the tree under their primary companion.
                  </p>
                </section>
                </>
              )}

              {!readOnly && !editing ? (
                <PetComments
                  petId={pet.id}
                  currentUserId={currentUserId}
                  canEdit={canEdit}
                />
              ) : null}

              {!readOnly && canEdit && !editing ? (
                <section className="flex flex-col gap-4 border-t border-border pt-5">
                  <CompanionPicker
                    options={people}
                    value={companionIds}
                    onChange={onCompanionsChange}
                    disabled={links.pending}
                    label="Add or remove people"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      ref={editButtonRef}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        returnFocus(() =>
                          document.getElementById(`pet-${pet.id}-name`),
                        );
                        setEditing(true);
                      }}
                    >
                      Edit companion
                    </Button>
                    <ConfirmButton
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      confirm={{
                        title: `Remove ${pet.name}?`,
                        description:
                          "Their photo and comments go too.\nThis cannot be undone.",
                        confirmLabel: "Remove",
                        pendingLabel: "Removing…",
                        onConfirm: () => removePet(pet.id),
                        onSuccess: () => onClose(),
                      }}
                    >
                      Remove
                    </ConfirmButton>
                  </div>
                </section>
              ) : null}

              {!readOnly && !canEdit ? (
                <p className="border-t border-border pt-5 text-xs text-muted-foreground">
                  Only whoever added {pet.name}, a Root, or someone who can edit
                  their companions can change this.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** Drawn again only when what it's handed changes, never for the canvas
 *  moving around it (Step 87.2). */
export const PetPanel = React.memo(PetPanelImpl);
