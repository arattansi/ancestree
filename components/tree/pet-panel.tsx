"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  addPetCompanion,
  removePet,
  removePetCompanion,
  setPetPhoto,
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
import { UNREACHABLE } from "@/lib/action-feedback";
import {
  cropStyle,
  DEFAULT_CROP,
  parseCrop,
  type CropTransform,
} from "@/lib/image-crop";
import {
  formatPetBirthday,
  petBirthplace,
  petSchema,
  petYears,
  speciesLabel,
  SPECIES_GLYPHS,
  type PetFormValues,
  type PetSpecies,
} from "@/lib/pet-schema";
import type { TreePet } from "@/lib/pets";
import { createClient } from "@/lib/supabase/client";

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
export function PetPanel({
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
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const savedCrop = parseCrop(pet?.photo_crop);
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [prevId, setPrevId] = React.useState(pet?.id);

  const form = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    mode: "onChange",
    defaultValues: pet
      ? toFormValues(pet)
      : {
          name: "",
          species: "dog",
          species_label: "",
          year_born: "",
          birth_date: "",
          place_id_birth: null,
          city_of_birth: "",
          country_of_birth: "",
          is_deceased: false,
          year_died: "",
        },
  });

  // A different companion selected: drop any half-finished edit.
  if (pet?.id !== prevId) {
    setPrevId(pet?.id);
    setEditing(false);
    setPhotoFile(null);
    setCrop(pet ? parseCrop(pet.photo_crop) : DEFAULT_CROP);
    if (pet) form.reset(toFormValues(pet));
  }

  const labelById = React.useMemo(
    () => new Map(people.map((p) => [p.id, p.label])),
    [people],
  );

  // A handle each for the edit form, the links and the primary, so one of
  // them running doesn't hold up the others (Step 70).
  const edit = useAction({ inline: true });
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

  function onSave(values: PetFormValues) {
    if (!pet) return;
    const petId = pet.id;
    const file = photoFile;
    edit.run(
      "save",
      async () => {
        if (file) {
          try {
            const supabase = createClient();
            const path = `${treeId}/pets/${petId}/${crypto.randomUUID()}.jpg`;
            const { error } = await supabase.storage
              .from("photos")
              .upload(path, file, {
                contentType: "image/jpeg",
                upsert: false,
              });
            if (error) throw error;
            const res = await setPetPhoto(petId, path, crop);
            if (res.error) throw new Error(res.error);
          } catch {
            toast.warning(
              "The photo didn't upload — other changes still saved.",
            );
          }
        }
        return updatePet(petId, values);
      },
      {
        onSuccess: () => {
          returnFocus(() => editButtonRef.current);
          setEditing(false);
          setPhotoFile(null);
        },
      },
    );
  }

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
        className="w-full gap-0 overflow-y-auto sm:max-w-sm"
      >
        {pet ? (
          <>
            <SheetHeader className="gap-3">
              <div className="flex items-center gap-3">
                <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-border bg-muted text-xl">
                  {pet.photo_url ? (
                    <img
                      src={pet.photo_url}
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
                      value={photoFile}
                      onChange={setPhotoFile}
                      crop={crop}
                      onCropChange={setCrop}
                      currentUrl={pet.photo_url}
                      label="Photo"
                      disabled={edit.pending}
                      onBusyChange={setPhotoBusy}
                    />
                    <FormError>{edit.error}</FormError>
                    <div className="flex gap-2">
                      <PendingButton
                        type="submit"
                        size="sm"
                        pending={edit.pending}
                        pendingLabel="Saving…"
                        disabled={photoBusy}
                      >
                        Save
                      </PendingButton>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={edit.pending}
                        onClick={() => {
                          form.reset(toFormValues(pet));
                          setPhotoFile(null);
                          returnFocus(() => editButtonRef.current);
                          setEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
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
                        edit.setError(null);
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
