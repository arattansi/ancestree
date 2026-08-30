"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import {
  createSelfPerson,
  setPersonPhoto,
  updatePerson,
} from "@/app/actions/people";
import { PersonDocuments } from "@/components/person-documents";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { compressImage } from "@/lib/image";
import {
  emptyPersonValues,
  LINEAGE_TYPES,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

type ExistingPerson = PersonFormValues & {
  id: string;
  photo_path: string | null;
};

export function PersonForm({
  mode,
  treeId,
  isAdmin,
  person,
  photoUrl,
}: {
  mode: "onboarding" | "edit";
  treeId: string;
  isAdmin: boolean;
  person?: ExistingPerson;
  photoUrl?: string | null;
}) {
  const router = useRouter();
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = React.useState<string | null>(
    photoUrl ?? null,
  );
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: person
      ? { ...emptyPersonValues, ...stripExisting(person) }
      : emptyPersonValues,
  });

  const isDeceased = useWatch({ control: form.control, name: "is_deceased" });
  const submitting = form.formState.isSubmitting || photoBusy;

  React.useEffect(() => {
    if (!photoFile) return;
    const url = URL.createObjectURL(photoFile);
    setPhotoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photoFile]);

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

    if (mode === "onboarding") {
      const result = await createSelfPerson(values);
      if (result.error || !result.personId) {
        setSubmitError(result.error ?? "Couldn't save your entry.");
        return;
      }
      if (photoFile) {
        try {
          const path = await uploadPhoto(result.personId, photoFile);
          await setPersonPhoto(result.personId, path);
        } catch {
          toast.warning("Your entry was saved, but the photo didn't upload.");
        }
      }
      toast.success("Your entry is in the tree.");
      router.replace("/tree");
      router.refresh();
      return;
    }

    // edit
    if (!person) return;
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
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="given_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Given name</FormLabel>
                <FormControl>
                  <Input autoComplete="given-name" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormDescription>
                  Enter a given name or a preferred name.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="preferred_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Preferred name</FormLabel>
                <FormControl>
                  <Input autoComplete="nickname" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="family_name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Family name</FormLabel>
              <FormControl>
                <Input autoComplete="family-name" required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="date_of_birth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date of birth</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="city_of_birth"
            render={({ field }) => (
              <FormItem>
                <FormLabel>City of birth</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="country_of_birth"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country of birth</FormLabel>
              <FormControl>
                <Input autoComplete="country-name" required {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
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
                    setPhotoPreview(photoUrl ?? null);
                  }}
                >
                  Remove selected photo
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <FormField
          control={form.control}
          name="is_deceased"
          render={({ field }) => (
            <FormItem className="flex-row items-center gap-3">
              <FormControl>
                <Checkbox
                  id={field.name}
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel htmlFor={field.name} className="font-normal">
                This person is deceased
              </FormLabel>
            </FormItem>
          )}
        />

        {isDeceased ? (
          <div className="grid gap-4 rounded-lg border border-border p-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="date_of_death"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of death</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="place_of_death"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Place of death</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
        ) : null}

        {isAdmin ? (
          <FormField
            control={form.control}
            name="lineage_type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Lineage</FormLabel>
                <Select
                  value={field.value ?? null}
                  onValueChange={(v) => field.onChange(v ?? undefined)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Not set" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {LINEAGE_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormDescription>
                  Admin only. How this person connects to their parent.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" disabled={submitting || !form.formState.isValid}>
          {submitting
            ? "Saving…"
            : mode === "onboarding"
              ? "Add me to the tree"
              : "Save changes"}
        </Button>
      </form>

      {mode === "edit" && person ? (
        <div className="mt-8 border-t border-border pt-6">
          <PersonDocuments personId={person.id} treeId={treeId} />
        </div>
      ) : null}
    </Form>
  );
}

function stripExisting(person: ExistingPerson): PersonFormValues {
  const { id: _id, photo_path: _photo, ...values } = person;
  void _id;
  void _photo;
  return values;
}
