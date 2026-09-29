"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { fillPersonBlanks } from "@/app/actions/people";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import {
  PersonDetailFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Form } from "@/components/ui/form";
import { useAction } from "@/components/use-action";
import { usePhotoDraft } from "@/components/use-photo-draft";
import { filledPhrase, type Fillable } from "@/lib/fill-blanks";
import type { CropTransform } from "@/lib/image-crop";
import { personSchema, type PersonFormValues } from "@/lib/person-schema";
import { discardPhoto, uploadPhoto } from "@/lib/photo-upload";
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
  const photoDraft = usePhotoDraft();
  const action = useAction({ inline: true });

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: values,
  });
  // Read up front, not inside the button's `||`: react-hook-form only works
  // out `isValid` once it has been read, and a photo on its own dirties no
  // field to make it look again (Step 50).
  const { isDirty, isValid } = form.formState;
  const somethingToAdd = isDirty || photoDraft.file !== null;

  const onSubmit = form.handleSubmit((next) =>
    action.run(
      "save",
      async (): Promise<{ filled?: string[]; error?: string }> => {
        // Into the entry's folder first: the storage policy lets them while it
        // has no photo, and the fill names the file.
        let photo: { path: string; crop: CropTransform } | null = null;
        if (photoDraft.file) {
          try {
            const path = await uploadPhoto(
              { kind: "person", treeId, personId },
              photoDraft.file,
            );
            photo = { path, crop: photoDraft.crop };
          } catch {
            return {
              error:
                "The photo didn't upload. Someone may have just added one; refresh and look again, or remove it to save the rest.",
            };
          }
        }
        const result = await fillPersonBlanks(personId, next, photo);
        // A photo the entry didn't take — refused, or filled meanwhile —
        // isn't left behind (Step 77.4).
        if (photo && (result.error || !result.filled?.includes("photo"))) {
          await discardPhoto(photo.path);
        }
        return result;
      },
      {
        // Here, so the button stays busy until the tree shows: pressed again
        // on the way, it would upload the photo a second time.
        onSuccess: ({ filled = [] }) => {
          if (filled.length === 0) {
            toast.info("Nothing new to add: someone may have just filled that in.");
            return;
          }
          toast.success(`Added their ${filledPhrase(filled)}.`);
          router.push(treeFocusHref(personId));
        },
      },
    ),
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
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
            {...photoDraft.picker}
            disabled={action.pending}
          />
        ) : null}

        <FormError>{action.error}</FormError>

        <PendingButton
          type="submit"
          pending={action.pending}
          pendingLabel="Saving…"
          disabled={photoDraft.busy || !somethingToAdd || !isValid}
        >
          Add these details
        </PendingButton>
      </form>
    </Form>
  );
}
