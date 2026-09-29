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

import { addRelative, setPersonPhoto } from "@/app/actions/people";
import {
  ConnectionApprovalDialog,
  type SuggestionPrompt,
  type SuggestionResolution,
} from "@/components/connection-approval-dialog";
import type { ImpliedConnection } from "@/lib/connection-suggestions";
import { CoParentOffer } from "@/components/co-parent-offer";
import { FormError } from "@/components/form-error";
import { JoinsAsNote } from "@/components/joins-as-note";
import { PendingButton } from "@/components/pending-button";
import {
  PersonDetailFields,
  PersonDiedField,
  PersonFields,
  PersonNameFields,
} from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import { SpouseDatesFields } from "@/components/spouse-dates-fields";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";
import { usePhotoDraft } from "@/components/use-photo-draft";
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
import { isEmailAddress } from "@/lib/email-address";
import { marriageDateProblems } from "@/lib/partial-date";
import { personDisplayName } from "@/lib/person-name";
import { emptyPersonValues, personSchema } from "@/lib/person-schema";
import { toStoredSpouseDates, type SpouseDates } from "@/lib/spouse-dates";
import { attachPhoto } from "@/lib/photo-upload";
import { plural } from "@/lib/plural";
import { treeFocusHref } from "@/lib/tree-links";

/** Multi-connection cap — keeps the one submit transaction small (Task 11.4). */
const MAX_EXTRA_CONNECTIONS = 10;

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
  if (address && !isEmailAddress(address)) {
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

/** The entry saved but its invite didn't go, whether refused or unreachable. */
const INVITE_UNSENT =
  "Saved — but the invite didn't send. Send it again from their card.";

/**
 * How a save went (`persist`); or, before one, the connections its lines
 * imply, which are asked about first.
 */
type SaveOutcome = {
  error?: string;
  /** The person they set out to add, once saved. */
  primaryId?: string;
  askable?: ImpliedConnection[];
};

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
   * tie (Step 55) and say so before submit. Without it the form stays quiet
   * and the database still refuses.
   */
  bloodline?: Bloodline | null;
}) {
  const router = useRouter();
  // A tree with anchors refuses anyone with no blood tie (Step 55), a Root's
  // unconnected entry included, so there connecting isn't optional for anyone.
  const gateActive = (bloodline?.anchors.length ?? 0) > 0;
  const mustConnect = !isAdmin || gateActive;
  const [connecting, setConnecting] = React.useState(
    mustConnect || members.length > 0,
  );
  const photo = usePhotoDraft();
  // The form's save and the connection dialog's go through one handle: the
  // button pressed stays busy until the page it lands on shows, so a second
  // press can't save the same people again (Steps 61, 70).
  const action = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const addInBetweenButton = React.useRef<HTMLButtonElement>(null);
  const addConnectionButton = React.useRef<HTMLButtonElement>(null);
  const [suggestions, setSuggestions] = React.useState<ImpliedConnection[]>([]);
  const [pendingSave, setPendingSave] = React.useState<{
    values: FlowValues;
    edges: ReturnType<typeof buildChainEdges>;
  } | null>(null);
  const [addingMore, setAddingMore] = React.useState(false);
  // Adding a relative asks their name, how they connect (anyone in between
  // included, Step 78) and an invite up front, and keeps everything else
  // behind "Add more details" at the bottom (Step 44). Adding yourself
  // still shows it all.
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

  // The engine explains itself; the modal shows that explanation rather than
  // re-deriving a question from the rule name. Kept while the suggestions
  // are: the dialog starts its answers afresh whenever this array changes,
  // and a render while saving would otherwise blank them (Step 70).
  const prompts: SuggestionPrompt[] = React.useMemo(
    () =>
      suggestions.map((s) => ({
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
      })),
    [suggestions],
  );

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
  const primaryLabel = mode === "self" ? "You" : nameOf(0, "This person");

  // What's on the form, judged as the database will judge it (Step 55), so
  // they hear the rule before it refuses. Only a warning: a question at
  // submit ("is their partner also a parent?") can still draw the line it's
  // missing.
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

  function addIntermediate() {
    people.append(emptyPersonValues);
    links.append({ kind: "child" });
  }

  function removeLastIntermediate() {
    people.remove(people.fields.length - 1);
    links.remove(links.fields.length - 1);
  }

  // A block's Remove takes the block away, and focus with it: on to the
  // Remove of the block before, or, with none, to the button that adds one.
  function focusAfterRemove(
    previousRemoveId: string | null,
    add: React.RefObject<HTMLButtonElement | null>,
  ) {
    returnFocus(
      () =>
        (previousRemoveId && document.getElementById(previousRemoveId)) ||
        add.current,
    );
  }

  /**
   * Looks for the connections the tree implies (unless they've been
   * answered: `resolved`), then saves the entries and sends the invite asked
   * for with them, in one call (Step 77.5); a photo follows in a second.
   * Only the entries can fail it: once they exist, a photo or an invite that
   * doesn't go through is a warning, since a failure would bring the button
   * back and a second press would add everyone again.
   */
  async function save(
    values: FlowValues,
    edges: ReturnType<typeof buildChainEdges>,
    resolved:
      | {
          subject: PersonRef;
          related: PersonRef;
          suggested_type: ImpliedConnection["suggestedType"];
          source: ImpliedConnection["source"];
          resolution: SuggestionResolution;
        }[]
      | null,
  ): Promise<SaveOutcome> {
    const { file, crop } = photo;
    // Asked for with the entry, so sent once it exists: an invite to claim
    // it. The card they land on offers the same invite again.
    const address = asksInvite ? inviteAddress(values) : "";
    const result = await addRelative({
      treeId,
      people: values.people,
      edges,
      selfIndex: mode === "self" ? 0 : null,
      suggestions: resolved ?? [],
      detect: resolved
        ? undefined
        : {
            // Names go along so the engine can name people in its
            // explanations.
            newPeople: values.people.map((p) => ({
              familyName: p.last_name,
              dateOfBirth: p.date_of_birth || null,
              givenName: p.preferred_name || p.first_name || null,
              label: personDisplayName(p),
            })),
          },
      inviteEmail: address || null,
      photoFollows: file !== null,
    });

    if (result.askable?.length) return { askable: result.askable };
    if (result.error || !result.personIds) {
      // Without a blood tie (Step 55) the error names who needs one.
      return { error: result.error ?? "Couldn't save these entries." };
    }

    const primaryId = result.personIds[0];
    if (file && primaryId) {
      const res = await attachPhoto(
        { kind: "person", treeId, personId: primaryId },
        file,
        (path) => setPersonPhoto(primaryId, path, crop),
      );
      if (res.error) {
        toast.warning("Saved — but the photo didn't upload. Add it later.");
      }
    }
    if (result.inviteWarning) {
      toast.warning(INVITE_UNSENT, { description: result.inviteWarning });
    }

    toast.success(
      mode === "self"
        ? "You're in the family tree."
        : result.invited
          ? `Relative added. Invite sent to ${result.invited}.`
          : "Relative added.",
    );
    return { primaryId };
  }

  // Land on the person they set out to add, with their own tree pulled
  // out (Step 19.2). `personIds[0]` is always that person: the RPC returns
  // ids in the order `people` was sent, and the chain's in-between people
  // follow the primary one. The save already drew the pages again, so
  // the tree arrives fresh (Step 61). Called from the save's `onSuccess`,
  // which keeps its button busy until the page has changed.
  function land(primaryId: string | undefined) {
    router.replace(doneHref ?? treeFocusHref(primaryId));
  }

  const onSubmit = form.handleSubmit((values) => {
    if (needAnchor && !values.anchorId) {
      action.setError("Choose someone already in the tree to connect to.");
      return;
    }

    // The chain, a new sibling's parents, ticked co-parents and further
    // connections: the same lines the blood-tie warning judges (Step 55).
    // `members` is already scoped to this tree, and the RPC re-checks that
    // every target belongs to it (rejects cross-tree rows).
    const edges = flowEdges({
      anchorId: showChain ? values.anchorId : "",
      inBetween: intermediateCount,
      links: values.links,
      extraLinks: values.extraLinks,
      members,
      spouseFields: toStoredSpouseDates,
    });

    // Looking for implied connections, saving and landing are one run: the
    // button is busy all the way, and a failure anywhere, the server out of
    // reach included, is said by it.
    action.run(
      "save",
      (): Promise<SaveOutcome> => save(values, edges, null),
      {
        onSuccess: ({ askable, primaryId }) => {
          if (askable) {
            // Asked first; the dialog's answers save it.
            setSuggestions(askable);
            setPendingSave({ values, edges });
            return;
          }
          land(primaryId);
        },
      },
    );
  });

  function onResolve(resolutions: SuggestionResolution[]) {
    if (!pendingSave) return;
    const { values, edges } = pendingSave;
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
    action.run("save", () => save(values, edges, resolved), {
      onSuccess: ({ primaryId }) => {
        setPendingSave(null);
        setSuggestions([]);
        land(primaryId);
      },
    });
  }

  const photoField = (
    <PhotoPicker
      id="primary-photo"
      {...photo.picker}
      disabled={action.pending}
    />
  );

  return (
    <Form {...form}>
      <form
        onSubmit={onSubmit}
        className="flex flex-col gap-8"
        noValidate
      >
        {/* No heading over the names and no line explaining the form: the
            labels say it (Step 58). */}
        <section className="flex flex-col gap-6">
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
                self={mode === "self"}
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
            <h2 id="connect-heading" className="text-base font-semibold">
              Connect to the family tree
            </h2>

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
                              Also connect to {anchorLabel}&rsquo;s{" "}
                              {plural(anchorParents.length, "parent")} (
                              {anchorParents.map((p) => p.label).join(" & ")}).
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
                                id={`intermediate-${j}-remove`}
                                aria-label={`Remove in-between person ${j}`}
                                className="relative tap-target text-xs text-destructive underline underline-offset-2"
                                onClick={() => {
                                  removeLastIntermediate();
                                  // The one before is the last now, with
                                  // the Remove.
                                  focusAfterRemove(
                                    j > 1 ? `intermediate-${j - 1}-remove` : null,
                                    addInBetweenButton,
                                  );
                                }}
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

                    {/* Yellow: it was easy to miss (Step 54). Not behind "Add
                        more details" either: adding a relative often means
                        adding the people who lead to them (Step 78). */}
                    <Button
                      ref={addInBetweenButton}
                      type="button"
                      variant="attention"
                      size="sm"
                      className="self-start"
                      onClick={addIntermediate}
                    >
                      Add someone in between
                    </Button>

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
                                    id={`extra-${i}-remove`}
                                    aria-label={`Remove connection ${i + 1}`}
                                    className="relative tap-target text-xs text-destructive underline underline-offset-2"
                                    onClick={() => {
                                      extraLinks.remove(i);
                                      focusAfterRemove(
                                        i > 0 ? `extra-${i - 1}-remove` : null,
                                        addConnectionButton,
                                      );
                                    }}
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
                            ref={addConnectionButton}
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
            {/* Heard, not seen: where focus lands once it opens. */}
            <h2 ref={detailsHeading} tabIndex={-1} className="sr-only">
              More details
            </h2>
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
          <div className="border-t border-border pt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => setMoreDetails(true)}
            >
              <Plus />
              Add more details
            </Button>
          </div>
        ) : null}

        <FormError>{action.error}</FormError>

        <PendingButton
          type="submit"
          pending={action.pending}
          pendingLabel="Saving…"
          disabled={
            photo.busy || !form.formState.isValid || (needAnchor && !anchorId)
          }
        >
          {mode === "self"
            ? "Add me to the tree"
            : invitesOnSave
              ? "Add relative & send invite"
              : "Add relative"}
        </PendingButton>
      </form>

      <ConnectionApprovalDialog
        open={pendingSave !== null}
        prompts={prompts}
        busy={action.pending}
        error={action.error}
        onCancel={() => {
          setPendingSave(null);
          setSuggestions([]);
        }}
        onResolve={onResolve}
      />
    </Form>
  );
}
