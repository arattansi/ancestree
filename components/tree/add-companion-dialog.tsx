"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addPet, setPetPhoto } from "@/app/actions/pets";
import { CompanionFields } from "@/components/tree/companion-fields";
import {
  CompanionPicker,
  type CompanionOption,
} from "@/components/tree/companion-picker";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";
import {
  emptyPetValues,
  petSchema,
  type PetFormValues,
} from "@/lib/pet-schema";
import { createClient } from "@/lib/supabase/client";

/**
 * Add a companion animal.
 *
 * Opened from a person's panel, so the person you started from is already
 * picked and locked — a companion always belongs to someone. The photo is
 * uploaded after the row exists, because the storage path (and the policy that
 * guards it) is keyed on the new pet's id.
 */
export function AddCompanionDialog({
  open,
  onOpenChange,
  treeId,
  people,
  startingWith,
  isAdmin = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treeId: string;
  people: CompanionOption[];
  /** The person whose panel this was opened from. */
  startingWith: string;
  isAdmin?: boolean;
}) {
  const router = useRouter();
  const [companions, setCompanions] = React.useState<string[]>([startingWith]);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [crop, setCrop] = React.useState<CropTransform>(DEFAULT_CROP);

  const form = useForm<PetFormValues>({
    resolver: zodResolver(petSchema),
    mode: "onChange",
    defaultValues: emptyPetValues,
  });

  // Opened afresh, or from a different person's panel: start over from that
  // person. Done during render (the pattern the person panel uses) rather than
  // in an effect, so the dialog never paints a previous entry's values.
  const [seed, setSeed] = React.useState(`${open}:${startingWith}`);
  if (seed !== `${open}:${startingWith}`) {
    setSeed(`${open}:${startingWith}`);
    setCompanions([startingWith]);
    setPhotoFile(null);
    setCrop(DEFAULT_CROP);
    form.reset(emptyPetValues);
  }

  const submitting = form.formState.isSubmitting || photoBusy;

  async function onSubmit(values: PetFormValues) {
    if (companions.length === 0) {
      toast.error("Pick at least one person this companion belongs to.");
      return;
    }
    const result = await addPet({ values, companionIds: companions });
    if (result.error || !result.petId) {
      toast.error(result.error ?? "Couldn't add this companion.");
      return;
    }

    if (photoFile) {
      try {
        const supabase = createClient();
        const path = `${treeId}/pets/${result.petId}/${crypto.randomUUID()}.jpg`;
        const { error } = await supabase.storage
          .from("photos")
          .upload(path, photoFile, {
            contentType: "image/jpeg",
            upsert: false,
          });
        if (error) throw error;
        await setPetPhoto(result.petId, path, crop);
      } catch {
        toast.warning(
          "The photo didn't upload — the companion was still added.",
        );
      }
    }

    toast.success(`${values.name.trim()} added to the tree.`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Add a companion</DialogTitle>
        <DialogDescription>
          Pets sit alongside the family rather than in it — no lineage, no
          generation, just who they lived with.
        </DialogDescription>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-5 pt-2"
          >
            <CompanionFields
              control={form.control}
              idPrefix="add-companion"
              isAdmin={isAdmin}
            />

            <CompanionPicker
              options={people}
              value={companions}
              onChange={setCompanions}
              locked={[startingWith]}
              disabled={submitting}
            />

            <PhotoPicker
              id="add-companion-photo"
              value={photoFile}
              onChange={setPhotoFile}
              crop={crop}
              onCropChange={setCrop}
              label="Photo (optional)"
              disabled={submitting}
              onBusyChange={setPhotoBusy}
            />

            <div className="flex gap-2">
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Adding…" : "Add companion"}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={submitting}
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
