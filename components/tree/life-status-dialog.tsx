"use client";

import * as React from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { setLifeStatus } from "@/app/actions/people";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { PersonDetailFields } from "@/components/person-fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { useAction } from "@/components/use-action";
import { lifeStatusToast, whatGoes } from "@/lib/life-status";
import {
  personFormValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import type { TreeGraphPerson } from "@/lib/tree";

/**
 * Mark someone as deceased or living (Step 218), for a Branch who may do it
 * anywhere on the entry's home tree but can't edit the rest of it. Deceased,
 * it asks a date and place of death where none is recorded; living, it says
 * what goes with them. A form is its labels.
 */
export function LifeStatusDialog({
  open,
  onOpenChange,
  person,
  name,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  person: TreeGraphPerson;
  /** What the dialog and the toast call them: their first name. */
  name: string;
}) {
  const save = useAction({ inline: true });
  // The entry as it stood when the dialog opened: saving refreshes it while
  // the dialog fades out, and it shouldn't turn into the other question.
  const [entry, setEntry] = React.useState(person);
  const markDeceased = !entry.is_deceased;
  // Only what isn't recorded, as filling in asks.
  const show = React.useMemo(() => {
    const fields = new Set<string>();
    if (!entry.date_of_death) fields.add("date_of_death");
    if (entry.place_id_death == null && !entry.place_of_death?.trim()) {
      fields.add("place_of_death");
    }
    return fields;
  }, [entry]);
  const valuesOf = (of: TreeGraphPerson): PersonFormValues => ({
    ...personFormValues({ ...of, email: null, email_visible: null }),
    is_deceased: !of.is_deceased,
  });
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: valuesOf(person),
  });

  // Opened afresh, for this entry as it stands.
  const [wasOpen, setWasOpen] = React.useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setEntry(person);
      form.reset(valuesOf(person));
      save.setError(null);
    }
  }

  const onSubmit = form.handleSubmit((next) =>
    save.run("save", () => setLifeStatus(entry.id, next), {
      onSuccess: ({ changed = [] }) => {
        toast.success(lifeStatusToast(name, markDeceased, changed));
        onOpenChange(false);
      },
    }),
  );

  const goes = markDeceased ? null : whatGoes(entry);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!save.pending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogTitle>
          Mark {name} as {markDeceased ? "deceased" : "living"}?
        </DialogTitle>
        {goes ? <DialogDescription>{goes}</DialogDescription> : null}
        <Form {...form}>
          <form onSubmit={onSubmit} className="flex flex-col gap-4 pt-2" noValidate>
            {markDeceased && show.size > 0 ? (
              <PersonDetailFields
                control={form.control}
                isAdmin={false}
                idPrefix={`life-${entry.id}`}
                show={show}
              />
            ) : null}
            <FormError>{save.error}</FormError>
            <div className="flex gap-2">
              <PendingButton
                type="submit"
                size="sm"
                pending={save.pending}
                pendingLabel="saving…"
                disabled={!form.formState.isValid}
              >
                {markDeceased ? "mark as deceased" : "mark as living"}
              </PendingButton>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={save.pending}
                onClick={() => onOpenChange(false)}
              >
                cancel
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
