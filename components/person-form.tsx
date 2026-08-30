"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { setPersonPhoto, updatePerson } from "@/app/actions/people";
import { PersonDocuments } from "@/components/person-documents";
import { PersonFields } from "@/components/person-fields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { compressImage } from "@/lib/image";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

type ExistingPerson = PersonFormValues & {
  id: string;
  photo_path: string | null;
};

/** Edit an existing person entry (owner or admin). */
export function PersonForm({
  treeId,
  isAdmin,
  person,
  photoUrl,
}: {
  treeId: string;
  isAdmin: boolean;
  person: ExistingPerson;
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const objectUrl = React.useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  const photoPreview = objectUrl ?? photoUrl ?? null;

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: { ...emptyPersonValues, ...stripExisting(person) },
  });

  const submitting = form.formState.isSubmitting || photoBusy;

  React.useEffect(() => {
    if (!objectUrl) return;
    return () => URL.revokeObjectURL(objectUrl);
  }, [objectUrl]);

  async function handlePhotoPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      toast.error("Choose a JPEG, PNG, or WebP image.");
      return;
    }
    setPhotoBusy(true);
    try {
      setPhotoFile(await compressImage(file));
    } finally {
      setPhotoBusy(false);
    }
  }

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
        await setPersonPhoto(person.id, path);
      } catch {
        toast.warning("The photo didn't upload — other changes still saved.");
      }
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
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="photo">Photo</Label>
          <div className="flex items-center gap-4">
            <div className="relative size-16 shrink-0 overflow-hidden rounded-full border border-border bg-muted">
              {photoPreview ? (
                <Image
                  src={photoPreview}
                  alt="Selected photo preview"
                  fill
                  sizes="64px"
                  className="object-cover"
                  unoptimized
                />
              ) : (
                <span
                  aria-hidden
                  className="flex size-full items-center justify-center text-muted-foreground"
                >
                  ?
                </span>
              )}
            </div>
            <div className="flex flex-col gap-1">
              <Input
                id="photo"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handlePhotoPick}
                disabled={photoBusy}
              />
              <p className="text-xs text-muted-foreground">
                JPEG, PNG, or WebP. Resized on your device before upload.
              </p>
              {photoFile ? (
                <button
                  type="button"
                  className="self-start text-xs text-destructive underline underline-offset-2"
                  onClick={() => {
                    setPhotoFile(null);
                  }}
                >
                  Remove selected photo
                </button>
              ) : null}
            </div>
          </div>
        </div>

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

function stripExisting(person: ExistingPerson): PersonFormValues {
  const { id: _id, photo_path: _photo, ...values } = person;
  void _id;
  void _photo;
  return values;
}
