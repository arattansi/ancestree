"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addPet, setPetPhoto } from "@/app/actions/pets";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { CompanionFields } from "@/components/tree/companion-fields";
import {
  CompanionPicker,
  type CompanionOption,
} from "@/components/tree/companion-picker";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useAction } from "@/components/use-action";
import { usePhotoDraft } from "@/components/use-photo-draft";
import { DEFAULT_CROP } from "@/lib/image-crop";
import {
  emptyPetValues,
  petSchema,
  type PetFormValues,
} from "@/lib/pet-schema";
import { attachPhoto } from "@/lib/photo-upload";

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
  const [companions, setCompanions] = React.useState<string[]>([startingWith]);
  const photo = usePhotoDraft();
  const action = useAction({ inline: true });

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
    photo.reset(DEFAULT_CROP);
    form.reset(emptyPetValues);
    action.setError(null);
  }

  const submitting = action.pending || photo.busy;

  const onSubmit = form.handleSubmit((values) => {
    if (companions.length === 0) {
      action.setError("Pick at least one person this companion belongs to.");
      return;
    }
    const { file, crop } = photo;
    action.run(
      "add",
      async () => {
        // The person whose panel this was opened from is the primary
        // connection: they're the one the chip hangs from. Changed later from
        // the pet's panel.
        const result = await addPet({
          treeId,
          values,
          companionIds: companions,
          primaryPersonId: startingWith,
        });
        if (result.error || !result.petId) {
          return { error: result.error ?? "Couldn't add this companion." };
        }

        // The companion exists now, so a photo that fails only warns: a
        // second press would add it twice.
        if (file) {
          const petId = result.petId;
          const res = await attachPhoto(
            { kind: "pet", treeId, petId },
            file,
            (path) => setPetPhoto(petId, path, crop),
          );
          if (res.error) {
            toast.warning(
              "The photo didn't upload — the companion was still added.",
            );
          }
        }
        return result;
      },
      {
        // Companions are off the canvas until switched on, so nothing on
        // screen shows it arrived.
        success: `${values.name.trim()} added to the tree.`,
        onSuccess: () => onOpenChange(false),
      },
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogTitle>Add a companion</DialogTitle>

        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-5 pt-2">
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
              {...photo.picker}
              label="Photo (optional)"
              disabled={submitting}
            />

            <FormError>{action.error}</FormError>
            <div className="flex gap-2">
              <PendingButton
                type="submit"
                size="sm"
                pending={action.pending}
                pendingLabel="Adding…"
                disabled={photo.busy}
              >
                Add companion
              </PendingButton>
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
