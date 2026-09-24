"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { fillPersonBlanks } from "@/app/actions/people";
import {
  PersonDetailFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { filledPhrase, type Fillable } from "@/lib/fill-blanks";
import { DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";
import { personSchema, type PersonFormValues } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";
import { treeFocusHref } from "@/lib/tree-links";

/**
 * Fill in what's missing on an entry that isn't the viewer's to edit (Step
 * 44): its empty fields only, and a photo where there's none. What's there
 * stays as it is — `fill_person_blanks` sets nothing that isn't empty.
 */
export function PersonFillForm({
  treeId,
  personId,
  values,
  blanks,
}: {
  treeId: string;
  personId: string;
  /** The entry as it stands, so what's added is checked against what's
   *  there: a death can't come before the birth already recorded. */
  values: PersonFormValues;
  /** What's empty on it (`blankFields`), and so what the form asks. */
  blanks: readonly Fillable[];
}) {
  const router = useRouter();
  const show = React.useMemo(() => new Set<string>(blanks), [blanks]);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [crop, setCrop] = React.useState<CropTransform>(DEFAULT_CROP);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: values,
  });
  const submitting = form.formState.isSubmitting || photoBusy;
  const somethingToAdd = form.formState.isDirty || photoFile !== null;

  async function onSubmit(next: PersonFormValues) {
    setSubmitError(null);

    // Into the entry's folder first: the storage policy lets them while it
    // has no photo, and the fill names the file.
    let photo: { path: string; crop: CropTransform } | null = null;
    if (photoFile) {
      const path = `${treeId}/${personId}/${crypto.randomUUID()}.jpg`;
      const { error } = await createClient()
        .storage.from("photos")
        .upload(path, photoFile, { contentType: "image/jpeg", upsert: false });
      if (error) {
        setSubmitError(
          "The photo didn't upload. Someone may have just added one; refresh and look again, or remove it to save the rest.",
        );
        return;
      }
      photo = { path, crop };
    }

    const result = await fillPersonBlanks(personId, next, photo);
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    const filled = result.filled ?? [];
    if (filled.length === 0) {
      toast.info("Nothing new to add: someone may have just filled that in.");
      router.refresh();
      return;
    }
    toast.success(`Added their ${filledPhrase(filled)}.`);
    router.push(treeFocusHref(personId));
    router.refresh();
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <PersonNameFields control={form.control} show={show} required={false} />
        <PersonDetailFields
          control={form.control}
          isAdmin={false}
          lineage={false}
          idPrefix={`fill-${personId}`}
          show={show}
        />

        {show.has("photo") ? (
          <PhotoPicker
            id="fill-photo"
            value={photoFile}
            onChange={setPhotoFile}
            crop={crop}
            onCropChange={setCrop}
            onBusyChange={setPhotoBusy}
            disabled={form.formState.isSubmitting}
            hint="Optional. JPEG, PNG, or WebP; cropped and resized on your device."
          />
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={submitting || !somethingToAdd || !form.formState.isValid}
        >
          {submitting ? "Saving…" : "Add these details"}
        </Button>
      </form>
    </Form>
  );
}
