"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { sendClaimInvite } from "@/app/actions/invites";
import {
  addPeopleWithConnections,
  setPersonPhoto,
} from "@/app/actions/people";
import {
  SpouseDatesFields,
  spouseDates,
  type SpouseDates,
} from "@/components/add-person-flow";
import { CoParentOffer } from "@/components/co-parent-offer";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PersonFields } from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { coParentSelection, type PartnerOption } from "@/lib/connections";
import {
  closeRelativeEdges,
  closeRelativeProblem,
  type CloseKind,
  type CloseRelativeLinks,
} from "@/lib/first-tree";
import { DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";
import { marriageDateProblems } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

const TITLES: Record<CloseKind, string> = {
  parent: "Add a parent",
  partner: "Add a partner",
  child: "Add a child",
  sibling: "Add a sibling",
};

type Named = { id: string; name: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const router = useRouter();
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
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [crop, setCrop] = React.useState<CropTransform>(DEFAULT_CROP);
  const [inviteEmail, setInviteEmail] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const deceased = useWatch({ control: form.control, name: "is_deceased" });

  const partnerOptions: PartnerOption[] = partners.map((p) => ({
    id: p.id,
    label: p.name,
    isDivorced: p.isDivorced,
  }));
  const otherParent = kind === "parent" && parents.length === 1 ? parents[0] : null;
  const submitting = form.formState.isSubmitting || photoBusy;

  async function onSubmit(values: PersonFormValues) {
    setError(null);
    // Nobody is invited to take over a deceased person's entry.
    const address = values.is_deceased ? "" : inviteEmail.trim();
    if (address && !EMAIL_RE.test(address)) {
      setError("That email doesn't look right — fix it, or leave it empty.");
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
      links.marriage = spouseDates(marriage);
    }
    if (kind === "child") links.coParentIds = coParentSelection(coParents, partnerOptions);
    if (kind === "sibling") links.sharedParentIds = shared;

    const problem = closeRelativeProblem(kind, links);
    if (problem) {
      setError(problem);
      return;
    }

    const result = await addPeopleWithConnections({
      treeId,
      people: [values],
      edges: closeRelativeEdges(kind, founder.id, links),
      selfIndex: null,
    });
    const personId = result.personIds?.[0];
    if (result.error || !personId) {
      setError(result.error ?? "Couldn't add them. Try again.");
      return;
    }

    if (photoFile) {
      try {
        const supabase = createClient();
        const path = `${treeId}/${personId}/${crypto.randomUUID()}.jpg`;
        const { error: uploadError } = await supabase.storage
          .from("photos")
          .upload(path, photoFile, { contentType: "image/jpeg", upsert: false });
        if (uploadError) throw uploadError;
        const res = await setPersonPhoto(personId, path, crop);
        if (res.error) throw new Error(res.error);
      } catch {
        toast.warning("Added — but the photo didn't upload. Add it from the tree.");
      }
    }

    // Asked for with the entry, so sent once it exists, as the add-relative
    // form does (Step 31). The entry stays whatever happens here, and their
    // card on the tree offers the invite again.
    let invited: string | null = null;
    if (address) {
      const res = await sendClaimInvite(personId, address);
      if (res.error) {
        toast.warning("Added — but the invite didn't send. Send it again from their card.", {
          description: res.error,
        });
      } else {
        invited = res.email ?? address;
      }
    }

    toast.success(
      invited
        ? `${personDisplayName(values)} is on the tree. Invite sent to ${invited}.`
        : `${personDisplayName(values)} is on the tree.`,
    );
    onDone();
    router.refresh();
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
          value={photoFile}
          onChange={setPhotoFile}
          crop={crop}
          onCropChange={setCrop}
          onBusyChange={setPhotoBusy}
          label="Photo (optional)"
          disabled={submitting}
        />

        {error ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {error}
          </p>
        ) : null}

        <div className="flex gap-2">
          <Button type="submit" disabled={submitting}>
            {submitting ? "Adding…" : TITLES[kind]}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onDone}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  );
}
