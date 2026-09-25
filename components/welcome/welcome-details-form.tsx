"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  setPersonPhoto,
  setPersonPhotoCrop,
  updatePerson,
} from "@/app/actions/people";
import {
  PersonDetailFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { EntrySummary } from "@/components/welcome/entry-summary";
import type { Fillable } from "@/lib/fill-blanks";
import { parseCrop, type CropTransform } from "@/lib/image-crop";
import { personDisplayName, personInitials } from "@/lib/person-name";
import { personSchema, type PersonFormValues } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";
import { treeFocusHref } from "@/lib/tree-links";
import {
  enteredLine,
  missesAnything,
  type WelcomeEntry,
} from "@/lib/welcome";

/**
 * Their entry on the welcome (Step 50), theirs since a moment ago: what a
 * relative entered at the top, a photo and whatever's empty below it, and
 * "Change" for the rest (docs/design-system.md, "Step-by-step flows").
 * Saving, or skipping, opens the tree on them.
 */
export function WelcomeDetailsForm({
  homeTreeId,
  entry,
  photoUrl,
  birthPlace,
  asks,
}: {
  /** Where the entry's photos live. */
  homeTreeId: string;
  entry: WelcomeEntry & { id: string; photo_crop: unknown };
  photoUrl: string | null;
  /** The place of birth as it's recorded, for the line at the top. */
  birthPlace: string | null;
  /** What's empty on it (`welcomeAsks`), asked for up front. */
  asks: readonly Fillable[];
}) {
  const router = useRouter();
  const {
    id: personId,
    photo_path: photoPath,
    photo_crop: photoCrop,
    ...values
  } = entry;
  const [showAll, setShowAll] = React.useState(false);
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const savedCrop = React.useMemo(() => parseCrop(photoCrop), [photoCrop]);
  const [crop, setCrop] = React.useState<CropTransform>(savedCrop);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: values,
  });
  const show = React.useMemo(
    () => (showAll ? undefined : new Set<string>(asks)),
    [showAll, asks],
  );

  // The line at the top follows what's typed, so it reads as their card will.
  const live = useWatch({ control: form.control });
  const placeNow =
    live.place_id_birth === values.place_id_birth
      ? birthPlace
      : [live.city_of_birth, live.country_of_birth].filter(Boolean).join(", ");
  const pickedUrl = React.useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  React.useEffect(() => {
    if (!pickedUrl) return;
    return () => URL.revokeObjectURL(pickedUrl);
  }, [pickedUrl]);

  // Read up front, not inside the button's `||`: react-hook-form only works
  // out `isValid` once it has been read, and a photo on its own dirties no
  // field to make it look again.
  const { isDirty, isSubmitting, isValid } = form.formState;
  const reframed = !photoFile && !!photoPath && !sameCrop(crop, savedCrop);
  const somethingToSave = isDirty || photoFile !== null || reframed;
  const submitting = isSubmitting || photoBusy;

  async function onSubmit(next: PersonFormValues) {
    setSubmitError(null);
    const detailsChanged = form.formState.isDirty;

    let photoFailed = false;
    if (photoFile) {
      try {
        const path = `${homeTreeId}/${personId}/${crypto.randomUUID()}.jpg`;
        const { error } = await createClient()
          .storage.from("photos")
          .upload(path, photoFile, { contentType: "image/jpeg", upsert: false });
        if (error) throw error;
        const res = await setPersonPhoto(personId, path, crop);
        if (res.error) throw new Error(res.error);
      } catch {
        photoFailed = true;
      }
    } else if (reframed) {
      const res = await setPersonPhotoCrop(personId, crop);
      if (res.error) toast.warning("The photo’s new framing didn’t save.");
    }

    if (detailsChanged) {
      const result = await updatePerson(personId, next);
      if (result.error) {
        setSubmitError(result.error);
        return;
      }
    }

    if (photoFailed) {
      if (!detailsChanged) {
        setSubmitError("The photo didn’t upload. Try again, or skip it for now.");
        return;
      }
      toast.warning("The photo didn’t upload. The rest is saved.");
    } else {
      toast.success("Saved.");
    }
    router.push(treeFocusHref(personId));
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="border-b border-border pb-5">
          <EntrySummary
            name={personDisplayName(live)}
            initials={personInitials(live)}
            line={enteredLine(live, placeNow)}
            photoUrl={pickedUrl ?? photoUrl}
            crop={crop}
            action={
              showAll ? null : (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  className="shrink-0 self-start px-0"
                  onClick={() => setShowAll(true)}
                >
                  Change
                </Button>
              )
            }
          />
        </div>

        {showAll || asks.includes("photo") ? (
          <PhotoPicker
            id={`welcome-photo-${personId}`}
            value={photoFile}
            onChange={setPhotoFile}
            crop={crop}
            onCropChange={setCrop}
            currentUrl={photoUrl}
            onBusyChange={setPhotoBusy}
            disabled={form.formState.isSubmitting}
          />
        ) : null}

        <PersonNameFields
          control={form.control}
          show={show}
          required={showAll}
        />
        <PersonDetailFields
          control={form.control}
          isAdmin={false}
          lineage={false}
          idPrefix={`welcome-${personId}`}
          placeLabels={{ birth: birthPlace }}
          show={show}
        />

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={submitting || !somethingToSave || !isValid}
          >
            {submitting ? "Saving…" : "Save and see the tree"}
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={treeFocusHref(personId)} />}
            variant="ghost"
          >
            {missesAnything(asks) ? "Skip for now" : "See the tree"}
          </Button>
        </div>
      </form>
    </Form>
  );
}

function sameCrop(a: CropTransform, b: CropTransform): boolean {
  return a.zoom === b.zoom && a.focusX === b.focusX && a.focusY === b.focusY;
}
