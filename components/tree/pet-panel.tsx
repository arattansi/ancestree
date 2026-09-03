"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  addPetCompanion,
  removePet,
  removePetCompanion,
  setPetPhoto,
  updatePet,
} from "@/app/actions/pets";
import { CompanionFields } from "@/components/tree/companion-fields";
import {
  CompanionPicker,
  type CompanionOption,
} from "@/components/tree/companion-picker";
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
import {
  cropStyle,
  DEFAULT_CROP,
  parseCrop,
  type CropTransform,
} from "@/lib/image-crop";
import {
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
  is_deceased: pet.is_deceased,
  year_died: pet.year_died ? String(pet.year_died) : "",
});

/**
 * A companion's detail sheet.
 *
 * Where a person's panel carries claims, comments, flags, documents,
 * verification, and lineage, this carries a name, an animal, a couple of
 * years, a photo, and the people it belongs to. That gap is the feature: a
 * companion is a warm footnote on the tree, not another record to maintain.
 */
export function PetPanel({
  pet,
  treeId,
  people,
  canEdit,
  readOnly = false,
  onClose,
  onSelectPerson,
}: {
  pet: TreePet | null;
  treeId: string;
  /** Everyone on the canvas, for linking this companion to more of them. */
  people: CompanionOption[];
  canEdit: boolean;
  readOnly?: boolean;
  onClose: () => void;
  onSelectPerson: (personId: string) => void;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
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

  async function onSave(values: PetFormValues) {
    if (!pet) return;
    if (photoFile) {
      try {
        const supabase = createClient();
        const path = `${treeId}/pets/${pet.id}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("photos")
          .upload(path, photoFile, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (error) throw error;
        await setPetPhoto(pet.id, path, crop);
      } catch {
        toast.warning("The photo didn't upload — other changes still saved.");
      }
    }
    const result = await updatePet(pet.id, values);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Companion updated.");
    setEditing(false);
    setPhotoFile(null);
    router.refresh();
  }

  async function onAddCompanion(ids: string[]) {
    if (!pet) return;
    const added = ids.find((id) => !pet.companions.includes(id));
    const dropped = pet.companions.find((id) => !ids.includes(id));
    setBusy(true);
    const result = added
      ? await addPetCompanion(pet.id, added)
      : dropped
        ? await removePetCompanion(pet.id, dropped)
        : {};
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    router.refresh();
  }

  async function onRemove() {
    if (!pet) return;
    if (
      !window.confirm(
        `Remove ${pet.name} from the tree? This also deletes their photo.`,
      )
    ) {
      return;
    }
    setBusy(true);
    const result = await removePet(pet.id);
    setBusy(false);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    toast.success("Companion removed.");
    onClose();
    router.refresh();
  }

  const glyph = pet
    ? (SPECIES_GLYPHS[pet.species as PetSpecies] ?? SPECIES_GLYPHS.other)
    : SPECIES_GLYPHS.other;

  return (
    <Sheet
      open={pet !== null}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-sm">
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
                    onSubmit={form.handleSubmit(onSave)}
                    className="flex flex-col gap-5"
                  >
                    <CompanionFields
                      control={form.control}
                      idPrefix={`pet-${pet.id}`}
                    />
                    <PhotoPicker
                      id={`pet-photo-${pet.id}`}
                      value={photoFile}
                      onChange={setPhotoFile}
                      crop={crop}
                      onCropChange={setCrop}
                      currentUrl={pet.photo_url}
                      label="Photo"
                      disabled={form.formState.isSubmitting}
                      onBusyChange={setPhotoBusy}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={form.formState.isSubmitting || photoBusy}
                      >
                        {form.formState.isSubmitting ? "Saving…" : "Save"}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        disabled={form.formState.isSubmitting}
                        onClick={() => {
                          form.reset(toFormValues(pet));
                          setPhotoFile(null);
                          setEditing(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </form>
                </Form>
              ) : (
                <section className="flex flex-col gap-3">
                  <h2 className="text-sm font-semibold">Companion to</h2>
                  <ul className="flex flex-col gap-1">
                    {pet.companions.map((id) => (
                      <li key={id}>
                        <button
                          type="button"
                          className="text-sm underline underline-offset-2 hover:text-foreground"
                          onClick={() => onSelectPerson(id)}
                        >
                          {labelById.get(id) ?? "Someone on the tree"}
                        </button>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-muted-foreground">
                    A companion can belong to as many people as lived with them.
                  </p>
                </section>
              )}

              {!readOnly && canEdit && !editing ? (
                <section className="flex flex-col gap-4 border-t border-border pt-5">
                  <CompanionPicker
                    options={people}
                    value={pet.companions}
                    onChange={onAddCompanion}
                    disabled={busy}
                    label="Add or remove people"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(true)}
                      disabled={busy}
                    >
                      Edit companion
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={onRemove}
                      disabled={busy}
                    >
                      Remove
                    </Button>
                  </div>
                </section>
              ) : null}

              {!readOnly && !canEdit ? (
                <p className="border-t border-border pt-5 text-xs text-muted-foreground">
                  Whoever added this companion, an admin, or anyone who can edit
                  one of their people can make changes here.
                </p>
              ) : null}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
