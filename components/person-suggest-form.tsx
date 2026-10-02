"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { suggestEntryChange } from "@/app/actions/suggestions";
import { FloatingFormActions } from "@/components/floating-form-actions";
import { PendingButton } from "@/components/pending-button";
import { PersonFields } from "@/components/person-fields";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAction } from "@/components/use-action";
import { SUGGESTION_NOTE_MAX } from "@/lib/limits";
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
  const action = useAction({ inline: true });

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: values,
  });
  // Read up front, not inside the button's `||`: react-hook-form only works
  // out `isValid` once it has been read (Step 50).
  const { isDirty, isValid } = form.formState;
  // A note alone changes nothing, unless it's the note on one that waits;
  // a declined one can be resent unchanged.
  const somethingToSend =
    startsFrom === "declined" ||
    isDirty ||
    (startsFrom === "pending" && note.trim() !== startNote.trim());

  const onSubmit = form.handleSubmit((next) =>
    action.run(
      "send",
      () => suggestEntryChange({ treeId, personId, values: next, note }),
      {
        success: "Suggestion sent.",
        // Here, so the button stays busy until the tree shows, and a second
        // press can't send it again on the way.
        onSuccess: () => router.push(backHref),
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
            maxLength={SUGGESTION_NOTE_MAX}
            disabled={action.pending}
          />
        </div>

        <FloatingFormActions error={action.error}>
          <PendingButton
            type="submit"
            pending={action.pending}
            pendingLabel="sending…"
            disabled={!somethingToSend || !isValid}
          >
            send suggestion
          </PendingButton>
          <Button
            nativeButton={false}
            render={<Link href={backHref} />}
            variant="outline"
          >
            back to tree
          </Button>
        </FloatingFormActions>
      </form>
    </Form>
  );
}
