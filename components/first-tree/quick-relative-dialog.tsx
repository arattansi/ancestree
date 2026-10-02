"use client";

import * as React from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addRelative } from "@/app/actions/connections";
import { setPersonPhoto } from "@/app/actions/people";
import { AdultQuestion } from "@/components/adult-question";
import { CoParentOffer } from "@/components/co-parent-offer";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import { PersonFields } from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { SpouseDatesFields } from "@/components/spouse-dates-fields";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { usePhotoDraft } from "@/components/use-photo-draft";
import { coParentSelection, type PartnerOption } from "@/lib/connections";
import {
  closeRelativeEdges,
  closeRelativeProblem,
  type CloseKind,
  type CloseRelativeLinks,
} from "@/lib/first-tree";
import { isEmailAddress } from "@/lib/email-address";
import { minorRefusal, newPeopleToAsk } from "@/lib/minors";
import { marriageDateProblems } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { attachPhoto } from "@/lib/photo-upload";
import { toStoredSpouseDates, type SpouseDates } from "@/lib/spouse-dates";

const TITLES: Record<CloseKind, string> = {
  parent: "Add a parent",
  partner: "Add a partner",
  child: "Add a child",
  sibling: "Add a sibling",
};

type Named = { id: string; name: string };

type QuickRelativeProps = {
  kind: CloseKind;
  treeId: string;
  founder: { id: string; lastName: string };
  /** The founder's parents on the tree. */
  parents: Named[];
  /** The founder's partners on the tree. */
  partners: (Named & { isDivorced: boolean })[];
};

/**
 * Add one close relative in the founder's first run (Step 29): the person's
 * details, plus the one or two questions that place them — whether a second
 * parent partnered the first, who a child's other parent is, which parents
 * a sibling shares. The lines are drawn from those answers
 * (`closeRelativeEdges`), so there's no connection to build by hand.
 */
export function QuickRelativeDialog({
  open,
  onOpenChange,
  ...props
}: QuickRelativeProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogTitle>{TITLES[props.kind]}</DialogTitle>
        {/* The dialog's contents unmount once it closes, so each opening
            starts this form afresh — no one's values carry over. */}
        <QuickRelativeForm
          key={props.kind}
          {...props}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function QuickRelativeForm({
  kind,
  treeId,
  founder,
  parents,
  partners,
  onDone,
}: QuickRelativeProps & { onDone: () => void }) {
  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: {
      ...emptyPersonValues,
      // Parents, children and siblings mostly share a family name; a partner
      // mostly doesn't. It's only a start — the box is right there.
      last_name: kind === "partner" ? "" : founder.lastName,
    },
  });

  const [partnered, setPartnered] = React.useState(true);
  const [marriage, setMarriage] = React.useState<SpouseDates>({});
  const [marriageErrors, setMarriageErrors] = React.useState<{
    marriage?: string;
    divorce?: string;
  }>({});
  const [coParents, setCoParents] = React.useState<string[] | null>(null);
  const [shared, setShared] = React.useState<string[]>(parents.map((p) => p.id));
  const photo = usePhotoDraft();
  const [inviteEmail, setInviteEmail] = React.useState("");
  // Busy until the family step has drawn them in; what goes wrong shows by
  // the button.
  const action = useAction({ inline: true });
  const deceased = useWatch({ control: form.control, name: "is_deceased" });
  const dateOfBirth = useWatch({ control: form.control, name: "date_of_birth" });
  const watchedName = useWatch({ control: form.control });
  // A sibling could be a child, and isn't the founder's own: "18 or older?"
  // (Step 98). The founder's own child, parent or partner isn't asked.
  const [adult, setAdult] = React.useState<boolean | undefined>(undefined);
  const askedAdult =
    newPeopleToAsk({
      people: [{ is_deceased: deceased, date_of_birth: dateOfBirth }],
      edges: closeRelativeEdges(kind, founder.id, {
        sharedParentIds: kind === "sibling" ? shared : undefined,
      }),
      self: { kind: "existing", id: founder.id },
    }).length > 0;
  const adultName = (() => {
    const n = personDisplayName(watchedName);
    return n === "Unnamed person" ? "this person" : n;
  })();
  const underAge = askedAdult
    ? minorRefusal({
        asked: [0],
        people: [{ date_of_birth: dateOfBirth }],
        answers: new Map(adult === undefined ? [] : [[0, adult]]),
        nameOf: () => adultName,
      })
    : null;

  const partnerOptions: PartnerOption[] = partners.map((p) => ({
    id: p.id,
    label: p.name,
    isDivorced: p.isDivorced,
  }));
  const otherParent = kind === "parent" && parents.length === 1 ? parents[0] : null;
  const submitting = action.pending || photo.busy;

  function onSubmit(values: PersonFormValues) {
    action.setError(null);
    // Nobody is invited to take over a deceased person's entry.
    const address = values.is_deceased ? "" : inviteEmail.trim();
    if (address && !isEmailAddress(address)) {
      action.setError("That email doesn't look right — fix it, or leave it empty.");
      return;
    }
    const links: CloseRelativeLinks = {};
    if (otherParent && partnered) links.partnerIds = [otherParent.id];
    if (kind === "partner") {
      const problems = marriageDateProblems({
        marriageDate: marriage.marriage_date,
        isDivorced: marriage.is_divorced,
        divorceDate: marriage.divorce_date,
      });
      if (problems.marriage || problems.divorce) {
        setMarriageErrors({
          marriage: problems.marriage ?? undefined,
          divorce: problems.divorce ?? undefined,
        });
        return;
      }
      links.marriage = toStoredSpouseDates(marriage);
    }
    if (kind === "child") links.coParentIds = coParentSelection(coParents, partnerOptions);
    if (kind === "sibling") links.sharedParentIds = shared;

    if (askedAdult && (adult === undefined || underAge)) {
      action.setError(underAge ?? `Say whether ${adultName} is 18 or older.`);
      return;
    }

    const problem = closeRelativeProblem(kind, links);
    if (problem) {
      action.setError(problem);
      return;
    }

    action.run(
      "add",
      async (): Promise<{ error?: string; invited?: string }> => {
        // Them, their lines and the invite asked for with them, in one call
        // (Step 77.5); a photo follows in a second.
        const { file, crop } = photo;
        const result = await addRelative({
          treeId,
          people: [values],
          edges: closeRelativeEdges(kind, founder.id, links),
          selfIndex: null,
          adults: [askedAdult ? (adult ?? null) : null],
          inviteEmail: address || null,
          photoFollows: file !== null,
        });
        const personId = result.personIds?.[0];
        if (result.error || !personId) {
          return { error: result.error ?? "Couldn't add them. Try again." };
        }

        // They're on the tree from here on: nothing after this may send the
        // form back to its start, where a second press would add them twice.
        if (file) {
          const res = await attachPhoto(
            { kind: "person", treeId, personId },
            file,
            (path) => setPersonPhoto(personId, path, crop),
          );
          if (res.error) {
            toast.warning("Added — but the photo didn't upload. Add it from the tree.");
          }
        }

        // Asked for with the entry, so sent once it existed, as the
        // add-relative form does (Step 31). The entry stays whatever happened
        // to it, and their card on the tree offers the invite again.
        if (result.inviteWarning) {
          toast.warning("Added — but the invite didn't send. Send it again from their card.", {
            description: result.inviteWarning,
          });
        }
        return { invited: result.invited };
      },
      {
        onSuccess: ({ invited }) => {
          toast.success(
            invited
              ? `${personDisplayName(values)} is on the tree. Invite sent to ${invited}.`
              : `${personDisplayName(values)} is on the tree.`,
          );
          onDone();
        },
      },
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-5 pt-2"
        noValidate
      >
        <PersonFields
          control={form.control}
          isAdmin
          // Lineage is about the link to this person's own parent — for
          // a child, the founder adding them.
          lineage={kind === "child"}
          idPrefix={`quick-${kind}`}
        />

        {otherParent ? (
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              id="quick-parent-partnered"
              checked={partnered}
              onCheckedChange={(c) => setPartnered(c === true)}
              className="mt-0.5"
            />
            <span>They and {otherParent.name} were partners.</span>
          </label>
        ) : null}

        {kind === "partner" ? (
          <SpouseDatesFields
            idBase="quick-partner"
            value={marriage}
            errors={marriageErrors}
            onPatch={(patch) => {
              setMarriage((m) => ({ ...m, ...patch }));
              setMarriageErrors({});
            }}
          />
        ) : null}

        {kind === "child" ? (
          <CoParentOffer
            idBase="quick-child"
            partners={partnerOptions}
            chosen={coParents}
            onChange={setCoParents}
          />
        ) : null}

        {kind === "sibling" ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="mb-1 text-sm font-medium">
              Parents you share
            </legend>
            {parents.map((parent) => (
              <label
                key={parent.id}
                className="flex items-center gap-2 text-sm"
              >
                <Checkbox
                  id={`quick-sibling-${parent.id}`}
                  checked={shared.includes(parent.id)}
                  onCheckedChange={(c) =>
                    setShared((prev) =>
                      c === true
                        ? [...prev, parent.id]
                        : prev.filter((id) => id !== parent.id),
                    )
                  }
                />
                {parent.name}
              </label>
            ))}
            <p className="text-xs text-muted-foreground">
              Untick one for a half-sibling.
            </p>
          </fieldset>
        ) : null}

        {askedAdult ? (
          <AdultQuestion
            name={adultName}
            value={adult}
            onChange={setAdult}
            disabled={submitting}
          />
        ) : null}
        {underAge ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {underAge}
          </p>
        ) : null}

        {deceased ? null : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`quick-${kind}-invite`}>Invite them by email</Label>
              <Input
                id={`quick-${kind}-invite`}
                type="email"
                inputMode="email"
                // Not "email": that would fill in the founder's own.
                autoComplete="off"
                placeholder="them@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                disabled={submitting}
              />
              <p className="text-xs text-muted-foreground">
                Optional. We&rsquo;ll email them a link to join and take over
                this entry.
              </p>
            </div>
            {inviteEmail.trim() ? <JoinsAsNote /> : null}
          </div>
        )}

        <PhotoPicker
          id={`quick-${kind}-photo`}
          {...photo.picker}
          label="Photo (optional)"
          disabled={submitting}
        />

        <FormError>{action.error}</FormError>

        <div className="flex gap-2">
          <PendingButton
            type="submit"
            pending={action.pending}
            disabled={
              photo.busy || underAge !== null || (askedAdult && adult === undefined)
            }
            pendingLabel="adding…"
          >
            {TITLES[kind]}
          </PendingButton>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onDone}
          >
            cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
