"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { suggestEntryChange } from "@/app/actions/suggestions";
import { FloatingFormActions } from "@/components/floating-form-actions";
import { PersonFields } from "@/components/person-fields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { personSchema, type PersonFormValues } from "@/lib/person-schema";

/**
 * Suggest a change to an entry the viewer can't edit (Step 67): its details
 * as they stand, to change as they think they should read, and a note. The
 * entry's owner, the Roots of its home tree and the Branches there who tend
 * it (Step 68) are asked; nothing changes until one of them, or anyone else
 * who may edit it, accepts.
 */
export function PersonSuggestForm({
  treeId,
  personId,
  values,
  placeLabels,
  note: startNote,
  startsFrom,
  backHref,
}: {
  treeId: string;
  personId: string;
  /** The entry as it stands, or with a suggestion of the viewer's laid over
   *  it (`startsFrom`). */
  values: PersonFormValues;
  placeLabels?: { birth?: string | null; death?: string | null };
  /** What the note opens with: that suggestion's. */
  note: string;
  /**
   * Where the form starts: the entry; their suggestion still waiting,
   * which sending replaces; or one that was declined, being resent (Step
   * 71), which can go again as it is.
   */
  startsFrom: "entry" | "pending" | "declined";
  backHref: string;
}) {
  const router = useRouter();
  const [note, setNote] = React.useState(startNote);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: values,
  });
  // Read up front, not inside the button's `||`: react-hook-form only works
  // out `isValid` once it has been read (Step 50).
  const { isDirty, isSubmitting, isValid } = form.formState;
  // A note alone changes nothing, unless it's the note on one that waits;
  // a declined one can be resent unchanged.
  const somethingToSend =
    startsFrom === "declined" ||
    isDirty ||
    (startsFrom === "pending" && note.trim() !== startNote.trim());

  async function onSubmit(next: PersonFormValues) {
    setSubmitError(null);
    const result = await suggestEntryChange({
      treeId,
      personId,
      values: next,
      note,
    });
    if (result.error) {
      setSubmitError(result.error);
      return;
    }
    toast.success("Suggestion sent.");
    router.push(backHref);
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
          isAdmin={false}
          lineage={false}
          idPrefix={`suggest-${personId}`}
          placeLabels={placeLabels}
        />

        <div className="flex flex-col gap-2">
          <Label htmlFor="suggest-note">Note</Label>
          <Textarea
            id="suggest-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            maxLength={500}
            disabled={isSubmitting}
          />
        </div>

        <FloatingFormActions error={submitError}>
          <Button
            type="submit"
            disabled={isSubmitting || !somethingToSend || !isValid}
          >
            {isSubmitting ? "Sending…" : "Send suggestion"}
          </Button>
          <Button
            nativeButton={false}
            render={<Link href={backHref} />}
            variant="outline"
          >
            Back to tree
          </Button>
        </FloatingFormActions>
      </form>
    </Form>
  );
}
