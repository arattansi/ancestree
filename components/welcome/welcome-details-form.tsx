"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { updatePerson, type PhotoChange } from "@/app/actions/people";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import {
  PersonDetailFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { useAction } from "@/components/use-action";
import { usePhotoDraft, usePickedUrl } from "@/components/use-photo-draft";
import { EntrySummary } from "@/components/welcome/entry-summary";
import type { Fillable } from "@/lib/fill-blanks";
import { parseCrop } from "@/lib/image-crop";
import { personDisplayName, personInitials } from "@/lib/person-name";
import { personSchema, type PersonFormValues } from "@/lib/person-schema";
import { discardPhoto, uploadPhoto } from "@/lib/photo-upload";
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
  const savedCrop = React.useMemo(() => parseCrop(photoCrop), [photoCrop]);
  const photo = usePhotoDraft(savedCrop);
  const action = useAction({ inline: true });

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
  const pickedUrl = usePickedUrl(photo.file);

  // Read up front, not inside the button's `||`: react-hook-form only works
  // out `isValid` once it has been read, and a photo on its own dirties no
  // field to make it look again.
  const { isDirty, isValid } = form.formState;
  const reframed = !!photoPath && photo.reframed;
  const somethingToSave = isDirty || photo.file !== null || reframed;

  const onSubmit = form.handleSubmit((next) =>
    action.run(
      "save",
      async (): Promise<{ error?: string }> => {
        const detailsChanged = form.formState.isDirty;

        // The file goes up first; the details and the photo are then saved
        // in one write (Step 77.5).
        let photoFailed = false;
        const { file, crop } = photo;
        let change: PhotoChange | null = null;
        if (file) {
          try {
            const path = await uploadPhoto(
              { kind: "person", treeId: homeTreeId, personId },
              file,
            );
            change = { path, crop };
          } catch {
            photoFailed = true;
          }
        } else if (reframed) {
          change = { crop };
        }

        if (detailsChanged || change) {
          const result = await updatePerson(personId, next, change);
          if (result.error) {
            if (change && "path" in change) await discardPhoto(change.path);
            return result;
          }
        }

        if (photoFailed) {
          if (!detailsChanged) {
            return { error: "The photo didn’t upload. Try again, or skip it for now." };
          }
          toast.warning("The photo didn’t upload. The rest is saved.");
        } else {
          toast.success("Saved.");
        }
        return {};
      },
      // Here, so the button stays busy until the tree shows: pressed again
      // on the way, it would upload the photo a second time.
      { onSuccess: () => router.push(treeFocusHref(personId)) },
    ),
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="border-b border-border pb-5">
          <EntrySummary
            name={personDisplayName(live)}
            initials={personInitials(live)}
            line={enteredLine(live, placeNow)}
            photoUrl={pickedUrl ?? photoUrl}
            crop={photo.crop}
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
            {...photo.picker}
            currentUrl={photoUrl}
            disabled={action.pending}
          />
        ) : null}

        <PersonNameFields
          control={form.control}
          show={show}
          required={showAll}
          self
        />
        <PersonDetailFields
          control={form.control}
          isAdmin={false}
          lineage={false}
          idPrefix={`welcome-${personId}`}
          placeLabels={{ birth: birthPlace }}
          show={show}
        />

        <FormError>{action.error}</FormError>

        <div className="flex flex-wrap items-center gap-3">
          <PendingButton
            type="submit"
            pending={action.pending}
            pendingLabel="Saving…"
            disabled={photo.busy || !somethingToSave || !isValid}
          >
            Save and see the tree
          </PendingButton>
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
