"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  setPersonPhoto,
  setPersonPhotoCrop,
  updatePerson,
} from "@/app/actions/people";
import { PersonDocuments } from "@/components/person-documents";
import { PersonFields } from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { parseCrop, type CropTransform } from "@/lib/image-crop";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

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
}: {
  treeId: string;
  isAdmin: boolean;
  person: ExistingPerson;
  photoUrl?: string | null;
  placeLabels?: { birth?: string | null; death?: string | null };
}) {
  const router = useRouter();
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const savedCrop = React.useMemo(
    () => parseCrop(person.photo_crop),
    [person.photo_crop],
  );
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: { ...emptyPersonValues, ...stripExisting(person) },
  });

  const submitting = form.formState.isSubmitting || photoBusy;

  async function uploadPhoto(personId: string, file: File): Promise<string> {
    const supabase = createClient();
    const path = `${treeId}/${personId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(path, file, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  }

  async function onSubmit(values: PersonFormValues) {
    setSubmitError(null);
    if (photoFile) {
      try {
        const path = await uploadPhoto(person.id, photoFile);
        await setPersonPhoto(person.id, path, crop);
      } catch {
        toast.warning("The photo didn't upload — other changes still saved.");
      }
    } else if (person.photo_path && !sameCrop(crop, savedCrop)) {
      await setPersonPhotoCrop(person.id, crop);
    }
    const result = await updatePerson(person.id, values);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    toast.success("Changes saved.");
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <PersonFields
          control={form.control}
          isAdmin={isAdmin}
          idPrefix={`person-${person.id}`}
          placeLabels={placeLabels}
        />

        <PhotoPicker
          id="photo"
          value={photoFile}
          onChange={setPhotoFile}
          crop={crop}
          onCropChange={setCrop}
          currentUrl={photoUrl}
          onBusyChange={setPhotoBusy}
          disabled={form.formState.isSubmitting}
        />

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting || !form.formState.isValid}>
          {submitting ? "Saving…" : "Save changes"}
        </Button>
      </form>

      <div className="mt-8 border-t border-border pt-6">
        <PersonDocuments personId={person.id} treeId={treeId} />
      </div>
    </Form>
  );
}

function sameCrop(a: CropTransform, b: CropTransform): boolean {
  return a.zoom === b.zoom && a.focusX === b.focusX && a.focusY === b.focusY;
}

function stripExisting(person: ExistingPerson): PersonFormValues {
  const { id: _id, photo_path: _photo, photo_crop: _crop, ...values } = person;
  void _id;
  void _photo;
  void _crop;
  return values;
}
