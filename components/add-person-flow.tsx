"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import {
  useFieldArray,
  useForm,
  useWatch,
  type Control,
} from "react-hook-form";
import { Plus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

import { sendClaimInvite } from "@/app/actions/invites";
import {
  addPeopleWithConnections,
  detectConnections,
  setPersonPhoto,
} from "@/app/actions/people";
import {
  ConnectionApprovalDialog,
  type SuggestionPrompt,
  type SuggestionResolution,
} from "@/components/connection-approval-dialog";
import type { ImpliedConnection } from "@/lib/connection-suggestions";
import { CoParentOffer } from "@/components/co-parent-offer";
import { DateField } from "@/components/date-field";
import { JoinsAsNote } from "@/components/joins-as-note";
import {
  PersonDetailFields,
  PersonDiedField,
  PersonFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
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
import {
  bloodTieWarning,
  newWithoutBloodTie,
  type Bloodline,
} from "@/lib/bloodline";
import {
  buildChainEdges,
  flowEdges,
  KIND_STATEMENT,
  RELATIONSHIP_KINDS,
  type PersonRef,
  type RelationshipKind,
} from "@/lib/connections";
import { DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";
import { marriageDateProblems, toStoredDate } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import { emptyPersonValues, personSchema } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";
import { treeFocusHref } from "@/lib/tree-links";

/** Multi-connection cap — keeps the one submit transaction small (Task 11.4). */
const MAX_EXTRA_CONNECTIONS = 10;

export type SpouseDates = {
  marriage_date?: string;
  is_divorced?: boolean;
  divorce_date?: string;
};

/** Normalise a spouse link's optional marriage/divorce fields for an edge. */
export function spouseDates(link: SpouseDates | undefined) {
  return {
    // Whole dates, padded to ISO ("1965-03-5" → "1965-03-05").
    marriage_date: toStoredDate(link?.marriage_date).date,
    is_divorced: link?.is_divorced ?? false,
    divorce_date: link?.is_divorced
      ? toStoredDate(link?.divorce_date).date
      : null,
  };
}

/** Optional marriage / divorce fields carried on a spouse link (Step 11.5). */
const spouseDatesShape = {
  marriage_date: z.string().optional(),
  is_divorced: z.boolean().optional(),
  divorce_date: z.string().optional(),
};

/**
 * A link's marriage dates are only checked while it is a spouse link: one
 * switched to "child" keeps its old dates in the form, and they mustn't hold
 * up a submit they no longer belong to.
 */
function spouseDateIssues(
  link: SpouseDates & { kind: string },
): { path: "marriage_date" | "divorce_date"; message: string }[] {
  if (link.kind !== "spouse") return [];
  const { marriage, divorce } = marriageDateProblems({
    marriageDate: link.marriage_date,
    isDivorced: link.is_divorced,
    divorceDate: link.divorce_date,
  });
  return [
    ...(marriage ? [{ path: "marriage_date" as const, message: marriage }] : []),
    ...(divorce ? [{ path: "divorce_date" as const, message: divorce }] : []),
  ];
}

/** Marriage and divorce dates on a spouse link; the first run's partner step
 *  asks them too (Step 29). */
export function SpouseDatesFields({
  idBase,
  value,
  onPatch,
  errors,
}: {
  idBase: string;
  value: SpouseDates;
  onPatch: (patch: SpouseDates) => void;
  errors?: { marriage?: string; divorce?: string };
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-marriage`} className="text-xs font-normal">
          Marriage date (optional)
        </Label>
        <DateField
          id={`${idBase}-marriage`}
          value={value.marriage_date ?? ""}
          onChange={(v) => onPatch({ marriage_date: v })}
          aria-invalid={Boolean(errors?.marriage)}
        />
        {errors?.marriage ? (
          <p className="text-xs text-destructive">{errors.marriage}</p>
        ) : null}
      </div>
      <label className="flex items-center gap-3 text-sm">
        <Checkbox
          id={`${idBase}-divorced`}
          checked={value.is_divorced ?? false}
          onCheckedChange={(c) => onPatch({ is_divorced: c === true })}
        />
        <span>They later divorced</span>
      </label>
      {value.is_divorced ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${idBase}-divorce`} className="text-xs font-normal">
            Divorce date (optional)
          </Label>
          <DateField
            id={`${idBase}-divorce`}
            value={value.divorce_date ?? ""}
            onChange={(v) => onPatch({ divorce_date: v })}
            aria-invalid={Boolean(errors?.divorce)}
          />
          {errors?.divorce ? (
            <p className="text-xs text-destructive">{errors.divorce}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Someone in between, added in the same step. On the add-a-relative form
 * their name comes first and the rest on request, as for the person being
 * added (Step 44).
 */
function InBetweenFields({
  control,
  isAdmin,
  index,
  compact,
}: {
  control: Control<FlowValues>;
  isAdmin: boolean;
  index: number;
  compact: boolean;
}) {
  const [open, setOpen] = React.useState(!compact);
  const prefix = `people.${index}`;
  const idPrefix = `intermediate-${index}`;
  if (!compact) {
    return (
      <PersonFields
        control={control}
        isAdmin={isAdmin}
        prefix={prefix}
        idPrefix={idPrefix}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PersonNameFields control={control} prefix={prefix} />
      {open ? (
        <PersonDetailFields
          control={control}
          isAdmin={isAdmin}
          withDiedField
          prefix={prefix}
          idPrefix={idPrefix}
        />
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setOpen(true)}
        >
          <Plus />
          More about them
        </Button>
      )}
    </div>
  );
}

const flowSchema = z.object({
  people: z.array(personSchema).min(1),
  anchorId: z.string(),
  links: z.array(
    z.object({
      kind: z.enum(RELATIONSHIP_KINDS),
      /** Sibling links only — also connect to the sibling's parents. */
      linkToParents: z.boolean().optional(),
      /**
       * Child links only — the anchor's partners to record as a second parent.
       * Ids, so a partner deselected by hand stays deselected.
       */
      coParentIds: z.array(z.string()).optional(),
      ...spouseDatesShape,
    }).superRefine((link, ctx) => {
      for (const issue of spouseDateIssues(link)) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: [issue.path],
        });
      }
    }),
  ),
  extraLinks: z
    .array(
      z.object({
        targetId: z.string().min(1, "Pick someone on the tree."),
        kind: z.enum(RELATIONSHIP_KINDS),
        /** Child links only — the target's partners to record as a parent too. */
        coParentIds: z.array(z.string()).optional(),
        ...spouseDatesShape,
      }).superRefine((link, ctx) => {
        for (const issue of spouseDateIssues(link)) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: [issue.path],
          });
        }
      }),
    )
    .max(MAX_EXTRA_CONNECTIONS)
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        const key = `${r.targetId}:${r.kind}`;
        if (r.targetId && seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "This is the same connection twice.",
            path: [i, "targetId"],
          });
        }
        seen.add(key);
      });
    }),
  /** Invite the new person to claim their entry once it's saved. */
  inviteEmail: z.string().optional(),
}).superRefine((values, ctx) => {
  // Only asked, and only sent, while they're living.
  const address = inviteAddress(values);
  if (address && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
    ctx.addIssue({
      code: "custom",
      message: "That doesn't look like an email address.",
      path: ["inviteEmail"],
    });
  }
});
type FlowValues = z.infer<typeof flowSchema>;

/** Where the invite goes, or "" for none: a deceased person gets no invite. */
function inviteAddress(values: {
  people: { is_deceased: boolean }[];
  inviteEmail?: string;
}): string {
  if (values.people[0]?.is_deceased) return "";
  return (values.inviteEmail ?? "").trim();
}

export function AddPersonFlow({
  mode,
  treeId,
  isAdmin,
  members,
  initialName,
  initialAnchorId = null,
  anchorable = null,
  canInvite = false,
  doneHref,
  bloodline = null,
}: {
  mode: "self" | "relative";
  treeId: string;
  isAdmin: boolean;
  members: TreeMemberOption[];
  /**
   * Ask for an email and, once the entry is saved, invite them to claim it
   * (`sendClaimInvite`). They join as a Leaf.
   */
  canInvite?: boolean;
  /** Pre-fills the primary person's name — onboarding carries over the name
   *  the member typed into the "is one of these you?" search (Step 15). */
  initialName?: { first_name?: string; last_name?: string };
  /** Who they're connecting to, already picked — the canvas's Add button
   *  passes whoever was selected (Step 19.2). Must be one of `members`. */
  initialAnchorId?: string | null;
  /**
   * Whom a new entry may be connected from, when not everyone: a Leaf's own
   * line (Step 34). The database has the last word, since how they connect
   * matters too — from a cousin, a new child is on the line, a new parent
   * isn't.
   */
  anchorable?: ReadonlySet<string> | null;
  /** Where to go once saved, in place of the canvas opened on the new
   *  entry — a founder's first run carries on to its next step (Step 29). */
  doneHref?: string;
  /**
   * The tree's anchors and lines, to foresee a refusal for want of a blood
   * tie (Step 53) and say so before submit. Without it the form stays quiet
   * and the database still refuses.
   */
  bloodline?: Bloodline | null;
}) {
  const router = useRouter();
  // A tree with anchors refuses anyone with no blood tie (Step 53), a Root's
  // unconnected entry included, so there connecting isn't optional for anyone.
  const gateActive = (bloodline?.anchors.length ?? 0) > 0;
  const mustConnect = !isAdmin || gateActive;
  const [connecting, setConnecting] = React.useState(
    mustConnect || members.length > 0,
  );
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [crop, setCrop] = React.useState<CropTransform>(DEFAULT_CROP);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<ImpliedConnection[]>([]);
  const [pendingSave, setPendingSave] = React.useState<{
    values: FlowValues;
    edges: ReturnType<typeof buildChainEdges>;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [addingMore, setAddingMore] = React.useState(false);
  // Adding a relative asks their name, how they connect and an invite up
  // front, and keeps everything else behind "Add more details" at the
  // bottom (Step 44). Adding yourself still shows it all.
  const compact = mode === "relative";
  const [moreDetails, setMoreDetails] = React.useState(false);
  const details = !compact || moreDetails;
  const detailsHeading = React.useRef<HTMLHeadingElement>(null);
  // Opened from the bottom of the form: take the reader to what opened.
  React.useEffect(() => {
    if (moreDetails) detailsHeading.current?.focus();
  }, [moreDetails]);
  const asksInvite = mode === "relative" && canInvite;
  const anchorMembers = anchorable
    ? members.filter((m) => anchorable.has(m.id))
    : members;

  const form = useForm<FlowValues>({
    resolver: zodResolver(flowSchema),
    mode: "onChange",
    defaultValues: {
      people: [
        {
          ...emptyPersonValues,
          first_name: initialName?.first_name ?? "",
          last_name: initialName?.last_name ?? "",
        },
      ],
      anchorId: initialAnchorId ?? "",
      links: [{ kind: "child" }],
      extraLinks: [],
      inviteEmail: "",
    },
  });

  const people = useFieldArray({ control: form.control, name: "people" });
  const links = useFieldArray({ control: form.control, name: "links" });
  const extraLinks = useFieldArray({
    control: form.control,
    name: "extraLinks",
  });
  const watchedExtra =
    useWatch({ control: form.control, name: "extraLinks" }) ?? [];

  const watchedPeopleRaw = useWatch({ control: form.control, name: "people" });
  const watchedPeople = React.useMemo(
    () => watchedPeopleRaw ?? [],
    [watchedPeopleRaw],
  );
  const anchorId = useWatch({ control: form.control, name: "anchorId" }) ?? "";
  const watchedLinks = useWatch({ control: form.control, name: "links" }) ?? [];
  const watchedInviteEmail =
    useWatch({ control: form.control, name: "inviteEmail" }) ?? "";
  const primaryDeceased = watchedPeople[0]?.is_deceased ?? false;
  const invitesOnSave =
    asksInvite &&
    inviteAddress({ people: watchedPeople, inviteEmail: watchedInviteEmail })
      .length > 0;

  const showChain = mustConnect || connecting;
  const needAnchor = showChain;
  const intermediateCount = people.fields.length - 1;

  if (mustConnect && members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        The tree is empty. A Root needs to add someone first.
      </p>
    );
  }

  const nameOf = (idx: number, fallback: string) => {
    const n = personDisplayName(watchedPeople[idx] ?? {});
    return n === "Unnamed person" ? fallback : n;
  };
  const anchorMember = members.find((m) => m.id === anchorId);
  const anchorLabel = anchorMember?.label ?? "the tree";
  const anchorParents = anchorMember?.parents ?? [];
  // Partners of the anchor, offered as a second parent when the first chain
  // person is being added as the anchor's child. A current partner is the
  // overwhelmingly likely other parent, so it is pre-ticked; a former one is
  // offered but left for the member to decide.
  const anchorPartners = anchorMember?.partners ?? [];
  const primaryFallback = mode === "self" ? "You" : "this person";
  const primaryLabel = mode === "self" ? "You" : nameOf(0, "This person");

  // What's on the form, judged as the database will judge it (Step 53), so
  // they hear the rule before it refuses. Only a warning: a question at
  // submit ("is Arzu also a parent?") can still draw the line it's missing.
  const tieWarning = (() => {
    if (!bloodline || !gateActive || !showChain || !anchorId) return null;
    const pending = flowEdges({
      anchorId,
      inBetween: intermediateCount,
      links: watchedLinks,
      extraLinks: watchedExtra,
      members,
    });
    const [first] = newWithoutBloodTie(
      intermediateCount + 1,
      pending,
      bloodline,
    );
    if (first === undefined) return null;
    return bloodTieWarning({
      name: nameOf(
        first,
        first === 0 ? "this person" : `in-between person ${first}`,
      ),
      self: mode === "self" && first === 0,
      // The first in the chain hangs off the anchor alone.
      nonBloodAnchor:
        first === (intermediateCount > 0 ? 1 : 0) ? anchorLabel : null,
    });
  })();

  // nodes = [anchor, intermediate_1 … intermediate_k, primary]
  const linkObject = (i: number) =>
    i === 0 ? anchorLabel : nameOf(i, `Person ${i}`);
  const linkSubject = (i: number) =>
    i + 1 <= intermediateCount
      ? nameOf(i + 1, `Person ${i + 1}`)
      : primaryLabel;

  async function uploadPhoto(personId: string, file: File): Promise<string> {
    const supabase = createClient();
    const path = `${treeId}/${personId}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from("photos")
      .upload(path, file, { contentType: "image/jpeg", upsert: false });
    if (error) throw error;
    return path;
  }

  function addIntermediate() {
    people.append(emptyPersonValues);
    links.append({ kind: "child" });
  }

  function removeLastIntermediate() {
    people.remove(people.fields.length - 1);
    links.remove(links.fields.length - 1);
  }

  // The engine explains itself; the modal shows that explanation rather than
  // re-deriving a question from the rule name.
  const prompts: SuggestionPrompt[] = suggestions.map((s) => ({
    suggestion: s,
    question: s.reason,
    yesLabel:
      s.suggestedType === "spouse"
        ? "Yes, they're partners"
        : s.suggestedType === "parent"
          ? "Yes, add the parent"
          : s.suggestedType === "duplicate_check"
            ? "Yes, same person"
            : "Yes",
  }));

  async function persist(
    values: FlowValues,
    edges: ReturnType<typeof buildChainEdges>,
    resolved: {
      subject: PersonRef;
      related: PersonRef;
      suggested_type: ImpliedConnection["suggestedType"];
      source: ImpliedConnection["source"];
      resolution: SuggestionResolution;
    }[],
  ): Promise<boolean> {
    const result = await addPeopleWithConnections({
      treeId,
      people: values.people,
      edges,
      selfIndex: mode === "self" ? 0 : null,
      suggestions: resolved,
    });

    if (result.error || !result.personIds) {
      // Without a blood tie (Step 53) the error names who needs one.
      setSubmitError(result.error ?? "Couldn't save these entries.");
      return false;
    }

    const primaryId = result.personIds[0];
    if (photoFile && primaryId) {
      try {
        const path = await uploadPhoto(primaryId, photoFile);
        const res = await setPersonPhoto(primaryId, path, crop);
        if (res.error) throw new Error(res.error);
      } catch {
        toast.warning("Saved — but the photo didn't upload. Add it later.");
      }
    }

    // Asked for with the entry, so sent once it exists: an invite to claim it.
    // The entry stays saved whatever happens here, and the card they land on
    // offers the same invite again.
    const address = asksInvite ? inviteAddress(values) : "";
    let invited: string | null = null;
    if (address && primaryId) {
      const res = await sendClaimInvite(primaryId, address);
      if (res.error) {
        toast.warning(
          "Saved — but the invite didn't send. Send it again from their card.",
          { description: res.error },
        );
      } else {
        invited = res.email ?? address;
      }
    }

    toast.success(
      mode === "self"
        ? "You're in the family tree."
        : invited
          ? `Relative added. Invite sent to ${invited}.`
          : "Relative added.",
    );
    // Land on the person they set out to add, with their own tree pulled
    // out (Step 19.2). `personIds[0]` is always that person: the RPC returns
    // ids in the order `people` was sent, and the chain's in-between people
    // follow the primary one.
    router.replace(doneHref ?? treeFocusHref(primaryId));
    router.refresh();
    return true;
  }

  async function onSubmit(values: FlowValues) {
    setSubmitError(null);

    if (needAnchor && !values.anchorId) {
      setSubmitError("Choose someone already in the tree to connect to.");
      return;
    }

    // The chain, a new sibling's parents, ticked co-parents and further
    // connections: the same lines the blood-tie warning judges (Step 53).
    // `members` is already scoped to this tree, and the RPC re-checks that
    // every target belongs to it (rejects cross-tree rows).
    const edges = flowEdges({
      anchorId: showChain ? values.anchorId : "",
      inBetween: intermediateCount,
      links: values.links,
      extraLinks: values.extraLinks,
      members,
      spouseFields: spouseDates,
    });

    const detected = await detectConnections({
      treeId,
      // Names go along so the engine can name people in its explanations.
      newPeople: values.people.map((p) => ({
        familyName: p.last_name,
        dateOfBirth: p.date_of_birth || null,
        givenName: p.preferred_name || p.first_name || null,
        label: personDisplayName(p),
      })),
      pendingEdges: edges,
    });

    const askable = detected.suggestions ?? [];
    if (askable.length > 0) {
      setSuggestions(askable);
      setPendingSave({ values, edges });
      return;
    }

    await persist(values, edges, []);
  }

  async function onResolve(resolutions: SuggestionResolution[]) {
    if (!pendingSave) return;
    setSaving(true);
    // A merged prompt stands for several rules; record the answer against each
    // of them, so none of them asks again.
    const resolved = suggestions.flatMap((s, i) =>
      [s.source, ...s.alsoFrom].map((source) => ({
        subject: s.subject,
        related: s.related,
        suggested_type: s.suggestedType,
        source,
        resolution: resolutions[i],
      })),
    );
    const ok = await persist(pendingSave.values, pendingSave.edges, resolved);
    setSaving(false);
    if (ok) {
      setPendingSave(null);
      setSuggestions([]);
    }
  }

  const submitting = form.formState.isSubmitting || photoBusy || saving;

  const inBetweenHint = details
    ? "Missing someone in between? Add them below."
    : "Missing someone in between? Add them under “Add more details”.";

  const photoField = (
    <PhotoPicker
      id="primary-photo"
      value={photoFile}
      onChange={setPhotoFile}
      crop={crop}
      onCropChange={setCrop}
      onBusyChange={setPhotoBusy}
      disabled={form.formState.isSubmitting || saving}
      hint="Optional. JPEG, PNG, or WebP; cropped and resized on your device."
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        noValidate
      >
        <section className="flex flex-col gap-6">
          <h2 className="text-base font-semibold">
            {mode === "self" ? "Your details" : "Their details"}
          </h2>
          {compact ? (
            <>
              <PersonNameFields control={form.control} prefix="people.0" />
              {/* Up front, since it decides whether to ask for an invite. */}
              <PersonDiedField
                control={form.control}
                prefix="people.0"
                idPrefix="primary"
              />
            </>
          ) : (
            <>
              <PersonFields
                control={form.control}
                isAdmin={isAdmin}
                // Lineage describes the link to a parent; the first person on
                // an empty tree has none to describe (Step 29).
                lineage={members.length > 0 ? undefined : false}
                prefix="people.0"
                idPrefix="primary"
              />
              {photoField}
            </>
          )}

          {/* Nobody can be invited to claim a deceased person's entry
              (`private.can_invite_to_claim`), so the question goes with them. */}
          {asksInvite && !primaryDeceased ? (
            <div className="flex flex-col gap-3">
              <FormField
                control={form.control}
                name="inviteEmail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Invite them by email</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        inputMode="email"
                        // Not "email": that would fill in the member's own.
                        autoComplete="off"
                        placeholder="them@example.com"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>
                      Optional. We&rsquo;ll email them a link to join and take
                      over this entry.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              {invitesOnSave ? <JoinsAsNote /> : null}
            </div>
          ) : null}
        </section>

        {/* Nobody on the tree yet — a founder starting it — means nobody to
            connect to, so there's nothing to ask (Step 29). */}
        {mustConnect || members.length > 0 ? (
          <section className="flex flex-col gap-4 border-t border-border pt-6">
            <div>
              <h2 id="connect-heading" className="text-base font-semibold">
                Connect to the family tree
              </h2>
              <p className="text-sm text-muted-foreground">
                {anchorable
                  ? `Connect them to someone on your own line. ${inBetweenHint}`
                  : mustConnect
                    ? `Connect them to someone already on the tree. ${inBetweenHint}`
                    : "Optional for Roots."}
              </p>
            </div>

            {!mustConnect ? (
              <label className="flex items-center gap-3 text-sm">
                <Checkbox
                  id="connect-toggle"
                  checked={connecting}
                  onCheckedChange={(c) => setConnecting(c === true)}
                />
                <span>Connect this entry to someone on the tree</span>
              </label>
            ) : null}

            {showChain ? (
              <div className="flex flex-col gap-4">
                <RelationshipPicker
                  members={anchorMembers}
                  value={anchorId}
                  onChange={(id) =>
                    form.setValue("anchorId", id, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                  labelId="connect-heading"
                />

                {anchorId ? (
                  <div className="flex flex-col gap-3">
                    <p className="text-sm font-medium">How they connect</p>
                    {links.fields.map((field, i) => (
                      <div
                        key={field.id}
                        className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{linkSubject(i)}</span>
                          <Select
                            items={KIND_STATEMENT}
                            value={watchedLinks[i]?.kind ?? "child"}
                            onValueChange={(v) =>
                              form.setValue(
                                `links.${i}.kind`,
                                v as RelationshipKind,
                                { shouldDirty: true },
                              )
                            }
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {RELATIONSHIP_KINDS.map((k) => (
                                <SelectItem key={k} value={k}>
                                  {KIND_STATEMENT[k]}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <span className="font-medium">{linkObject(i)}</span>
                        </div>
                        {details && watchedLinks[i]?.kind === "spouse" ? (
                          <SpouseDatesFields
                            idBase={`link-${i}`}
                            value={watchedLinks[i] ?? {}}
                            errors={{
                              marriage:
                                form.formState.errors.links?.[i]?.marriage_date
                                  ?.message,
                              divorce:
                                form.formState.errors.links?.[i]?.divorce_date
                                  ?.message,
                            }}
                            onPatch={(patch) => {
                              for (const [k, v] of Object.entries(patch)) {
                                form.setValue(
                                  `links.${i}.${k}` as `links.${number}.marriage_date`,
                                  v as never,
                                  { shouldDirty: true, shouldValidate: true },
                                );
                              }
                            }}
                          />
                        ) : null}
                        {watchedLinks[i]?.kind === "child" && i === 0 ? (
                          <CoParentOffer
                            idBase={`link-${i}`}
                            partners={anchorPartners}
                            chosen={watchedLinks[i]?.coParentIds ?? null}
                            parentLabel={anchorLabel}
                            onChange={(ids) =>
                              form.setValue(`links.${i}.coParentIds`, ids, {
                                shouldDirty: true,
                              })
                            }
                          />
                        ) : null}
                        {watchedLinks[i]?.kind === "sibling" &&
                        i === 0 &&
                        anchorParents.length > 0 ? (
                          <label className="flex items-start gap-2 text-xs text-muted-foreground">
                            <Checkbox
                              id={`link-${i}-to-parents`}
                              checked={watchedLinks[i]?.linkToParents ?? false}
                              onCheckedChange={(c) =>
                                form.setValue(
                                  `links.${i}.linkToParents`,
                                  c === true,
                                  { shouldDirty: true },
                                )
                              }
                            />
                            <span>
                              Also connect to {anchorLabel}&rsquo;s parent
                              {anchorParents.length > 1 ? "s" : ""} (
                              {anchorParents.map((p) => p.label).join(" & ")}) so
                              they appear together as siblings.
                            </span>
                          </label>
                        ) : null}
                      </div>
                    ))}

                    {Array.from({ length: intermediateCount }).map((_, idx) => {
                      const j = idx + 1;
                      return (
                        <div
                          key={people.fields[j]?.id ?? j}
                          className="flex flex-col gap-4 rounded-lg border border-dashed border-border p-4"
                        >
                          <div className="flex items-center justify-between">
                            <h3 className="text-sm font-semibold">
                              In-between person {j}
                            </h3>
                            {j === intermediateCount ? (
                              <button
                                type="button"
                                className="text-xs text-destructive underline underline-offset-2"
                                onClick={removeLastIntermediate}
                              >
                                Remove
                              </button>
                            ) : null}
                          </div>
                          <InBetweenFields
                            control={form.control}
                            isAdmin={isAdmin}
                            index={j}
                            compact={compact}
                          />
                        </div>
                      );
                    })}

                    {details ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="self-start"
                          onClick={addIntermediate}
                        >
                          Add someone in between
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Reads top to bottom:{" "}
                          {primaryFallback === "You" ? "you" : "the new entry"}{" "}
                          connect{primaryFallback === "You" ? "" : "s"} through
                          each person to {anchorLabel}.
                        </p>
                      </>
                    ) : null}

                    {details ? (
                      <div className="flex flex-col gap-3 border-t border-border pt-4">
                        <label className="flex items-center gap-3 text-sm">
                          <Checkbox
                            id="more-connections-toggle"
                            checked={addingMore}
                            onCheckedChange={(c) => {
                              const on = c === true;
                              setAddingMore(on);
                              if (on && extraLinks.fields.length === 0) {
                                extraLinks.append({ targetId: "", kind: "child" });
                              }
                              if (!on) extraLinks.replace([]);
                            }}
                          />
                          <span>
                            {mode === "self"
                              ? "You connect"
                              : "This person connects"}{" "}
                            to more people on the tree
                          </span>
                        </label>

                        {addingMore
                          ? extraLinks.fields.map((field, i) => (
                              <div
                                key={field.id}
                                className="flex flex-col gap-2 rounded-md border border-border p-3"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-medium text-muted-foreground">
                                    Connection {i + 1}
                                  </span>
                                  <button
                                    type="button"
                                    className="text-xs text-destructive underline underline-offset-2"
                                    onClick={() => extraLinks.remove(i)}
                                  >
                                    Remove
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-sm">
                                  <span className="font-medium">
                                    {primaryLabel}
                                  </span>
                                  <Select
                                    items={KIND_STATEMENT}
                                    value={watchedExtra[i]?.kind ?? "child"}
                                    onValueChange={(v) =>
                                      form.setValue(
                                        `extraLinks.${i}.kind`,
                                        v as RelationshipKind,
                                        { shouldDirty: true, shouldValidate: true },
                                      )
                                    }
                                  >
                                    <SelectTrigger className="w-48">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {RELATIONSHIP_KINDS.map((k) => (
                                        <SelectItem key={k} value={k}>
                                          {KIND_STATEMENT[k]}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <RelationshipPicker
                                  members={members}
                                  value={watchedExtra[i]?.targetId ?? ""}
                                  onChange={(id) =>
                                    form.setValue(`extraLinks.${i}.targetId`, id, {
                                      shouldDirty: true,
                                      shouldValidate: true,
                                    })
                                  }
                                />
                                {form.formState.errors.extraLinks?.[i]?.targetId ? (
                                  <p className="text-xs font-medium text-destructive">
                                    {
                                      form.formState.errors.extraLinks[i]?.targetId
                                        ?.message
                                    }
                                  </p>
                                ) : null}
                                {watchedExtra[i]?.kind === "child" ? (
                                  <CoParentOffer
                                    idBase={`extra-${i}`}
                                    partners={
                                      members.find(
                                        (m) => m.id === watchedExtra[i]?.targetId,
                                      )?.partners ?? []
                                    }
                                    chosen={watchedExtra[i]?.coParentIds ?? null}
                                    parentLabel={
                                      members.find(
                                        (m) => m.id === watchedExtra[i]?.targetId,
                                      )?.label
                                    }
                                    onChange={(ids) =>
                                      form.setValue(
                                        `extraLinks.${i}.coParentIds`,
                                        ids,
                                        { shouldDirty: true },
                                      )
                                    }
                                  />
                                ) : null}
                                {watchedExtra[i]?.kind === "spouse" ? (
                                  <SpouseDatesFields
                                    idBase={`extra-${i}`}
                                    value={watchedExtra[i] ?? {}}
                                    errors={{
                                      marriage:
                                        form.formState.errors.extraLinks?.[i]
                                          ?.marriage_date?.message,
                                      divorce:
                                        form.formState.errors.extraLinks?.[i]
                                          ?.divorce_date?.message,
                                    }}
                                    onPatch={(patch) => {
                                      for (const [k, v] of Object.entries(patch)) {
                                        form.setValue(
                                          `extraLinks.${i}.${k}` as `extraLinks.${number}.marriage_date`,
                                          v as never,
                                          {
                                            shouldDirty: true,
                                            shouldValidate: true,
                                          },
                                        );
                                      }
                                    }}
                                  />
                                ) : null}
                              </div>
                            ))
                          : null}

                        {addingMore &&
                        extraLinks.fields.length < MAX_EXTRA_CONNECTIONS ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="self-start"
                            onClick={() =>
                              extraLinks.append({ targetId: "", kind: "child" })
                            }
                          >
                            Add another connection
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {tieWarning ? (
                      <p
                        role="status"
                        className="rounded-lg border border-border bg-muted/40 p-3 text-sm"
                      >
                        {tieWarning}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : null}
          </section>
        ) : null}

        {compact && moreDetails ? (
          <section className="flex flex-col gap-6 border-t border-border pt-6">
            <div>
              <h2
                ref={detailsHeading}
                tabIndex={-1}
                className="text-base font-semibold outline-none"
              >
                More details
              </h2>
              <p className="text-sm text-muted-foreground">All optional.</p>
            </div>
            <PersonDetailFields
              control={form.control}
              isAdmin={isAdmin}
              lineage={members.length > 0 ? undefined : false}
              prefix="people.0"
              idPrefix="primary"
            />
            {photoField}
          </section>
        ) : compact ? (
          <div className="flex flex-col items-start gap-1.5 border-t border-border pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoreDetails(true)}
            >
              <Plus />
              Add more details
            </Button>
            <p className="text-xs text-muted-foreground">
              Other names, sex, birth and death, a photo, and more ways to
              connect them.
            </p>
          </div>
        ) : null}

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button
          type="submit"
          disabled={
            submitting || !form.formState.isValid || (needAnchor && !anchorId)
          }
        >
          {submitting
            ? "Saving…"
            : mode === "self"
              ? "Add me to the tree"
              : invitesOnSave
                ? "Add relative & send invite"
                : "Add relative"}
        </Button>
      </form>

      <ConnectionApprovalDialog
        open={pendingSave !== null}
        prompts={prompts}
        busy={saving}
        onCancel={() => {
          setPendingSave(null);
          setSuggestions([]);
        }}
        onResolve={onResolve}
      />
    </Form>
  );
}
