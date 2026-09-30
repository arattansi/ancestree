"use client";

import Link from "next/link";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updatePerson, type PhotoChange } from "@/app/actions/people";
import { FloatingFormActions } from "@/components/floating-form-actions";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { PersonFields } from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAction } from "@/components/use-action";
import { usePhotoDraft } from "@/components/use-photo-draft";
import { parseCrop } from "@/lib/image-crop";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { discardPhoto, uploadPhoto } from "@/lib/photo-upload";

type ExistingPerson = PersonFormValues & {
  id: string;
  photo_path: string | null;
  photo_crop: unknown;
};

/** Edit an existing person entry (owner or admin). */
export function PersonForm({
  treeId,
  isAdmin,
  person,
  photoUrl,
  placeLabels,
  withContact = false,
  self = false,
  backHref,
}: {
  treeId: string;
  isAdmin: boolean;
  person: ExistingPerson;
  photoUrl?: string | null;
  placeLabels?: { birth?: string | null; death?: string | null };
  /** The viewer owns this entry, so may see and set its contact details. */
  withContact?: boolean;
  /** The viewer's own entry, so the browser may fill in the names. */
  self?: boolean;
  /** Where "Back to tree" goes. Given one (the edit entry page), it and
   *  Save changes float beside the form (Step 59); without, as on the
   *  account page, Save changes ends the form. */
  backHref?: string;
}) {
  const savedCrop = React.useMemo(
    () => parseCrop(person.photo_crop),
    [person.photo_crop],
  );
  const photo = usePhotoDraft(savedCrop);
  const action = useAction({ inline: true });

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: { ...emptyPersonValues, ...stripExisting(person) },
  });

  const onSubmit = form.handleSubmit((values) =>
    action.run(
      "save",
      async () => {
        // The file goes up first; the details and the photo are then saved
        // in one write (Step 77.5), so it's one change: one notice, one
        // undo. What went wrong with the upload is said only once the rest
        // has saved: "other changes still saved" can't come before they are.
        let photoProblem: string | null = null;
        const { file, crop } = photo;
        let change: PhotoChange | null = null;
        if (file) {
          try {
            const path = await uploadPhoto(
              { kind: "person", treeId, personId: person.id },
              file,
            );
            change = { path, crop };
          } catch {
            photoProblem = "The photo didn't upload — other changes still saved.";
          }
        } else if (person.photo_path && photo.reframed) {
          change = { crop };
        }
        const result = await updatePerson(person.id, values, change);
        if (result.error) {
          if (change && "path" in change) await discardPhoto(change.path);
          return { ...result, photoSaved: false };
        }
        if (photoProblem) toast.warning(photoProblem);
        return { ...result, photoSaved: file !== null && !photoProblem };
      },
      {
        // The page stays put, so this is the only sign it went through.
        success: "Changes saved.",
        // Saved, the photo is the entry's now: kept as the one picked, a
        // second Save would upload it again.
        onSuccess: ({ photoSaved }) => {
          if (photoSaved) photo.clearFile();
        },
      },
    ),
  );

  const save = (
    <PendingButton
      type="submit"
      pending={action.pending}
      pendingLabel="Saving…"
      disabled={photo.busy || !form.formState.isValid}
    >
      Save changes
    </PendingButton>
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
        noValidate
      >
        <PersonFields
          control={form.control}
          isAdmin={isAdmin}
          idPrefix={`person-${person.id}`}
          placeLabels={placeLabels}
          withContact={withContact}
          self={self}
        />

        <PhotoPicker
          id="photo"
          {...photo.picker}
          currentUrl={photoUrl}
          disabled={action.pending}
        />

        {backHref ? (
          <FloatingFormActions error={action.error}>
            {save}
            <Button
              nativeButton={false}
              render={<Link href={backHref} />}
              variant="outline"
            >
              Back to tree
            </Button>
          </FloatingFormActions>
        ) : (
          <>
            <FormError>{action.error}</FormError>
            {save}
          </>
        )}
      </form>
    </Form>
  );
}

function stripExisting(person: ExistingPerson): PersonFormValues {
  const { id: _id, photo_path: _photo, photo_crop: _crop, ...values } = person;
  void _id;
  void _photo;
  void _crop;
  return values;
}
