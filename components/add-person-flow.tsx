"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { Plus } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { addRelative } from "@/app/actions/connections";
import { setPersonPhoto } from "@/app/actions/people";
import {
  ConnectionApprovalDialog,
  type SuggestionPrompt,
  type SuggestionResolution,
} from "@/components/connection-approval-dialog";
import type { ImpliedConnection } from "@/lib/connection-suggestions";
import { AdultQuestion } from "@/components/adult-question";
import { AddPlaceholderButton } from "@/components/placeholder-child";
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
import { InBetweenFields } from "@/components/in-between-fields";
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
  flowSchema,
  inviteAddress,
  MAX_EXTRA_CONNECTIONS,
  type FlowValues,
} from "@/lib/add-person-schema";
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
import {
  ageFromBirth,
  minorRefusal,
  newPeopleToAsk,
  underAgeMessage,
  type AskAdult,
} from "@/lib/minors";
import { placeholderParents } from "@/lib/placeholders";
import { personDisplayName } from "@/lib/person-name";
import { emptyPersonValues } from "@/lib/person-schema";
import { toStoredSpouseDates } from "@/lib/spouse-dates";
import { attachPhoto } from "@/lib/photo-upload";
import { plural } from "@/lib/plural";
import { treeFocusHref } from "@/lib/tree-links";

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
  /** A line asks "18 or older?" of someone on the tree already (Step 98). */
  askAdult?: AskAdult;
};

/** The answers a save went with, to send it again once the question's answered. */
type Resolved = NonNullable<Parameters<typeof addRelative>[0]["suggestions"]>;

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
  selfPersonId = null,
  canAddPlaceholder = false,
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
  /**
   * The member's own entry, when adding a relative: whoever they're drawn
   * as the parent of isn't asked "18 or older?" (Step 98).
   */
  selfPersonId?: string | null;
  /**
   * A Root or a Branch (Step 98.2): where someone under 18 is refused, offer
   * to hold their place under their parent instead.
   */
  canAddPlaceholder?: boolean;
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
  // "18 or older?" answers (Step 98), by the person's field id, so they stay
  // with the person when someone in between is removed.
  const [adultAnswers, setAdultAnswers] = React.useState<
    ReadonlyMap<string, boolean>
  >(new Map());
  // Someone already on the tree whom a line would make someone's child or
  // sibling, asked about as the save draws it (Step 98): the save waits
  // here, and a yes sends it again with every yes so far.
  const [lineAsk, setLineAsk] = React.useState<{
    ask: AskAdult;
    refused: boolean;
    values: FlowValues;
    edges: ReturnType<typeof buildChainEdges>;
    resolved: Resolved | null;
  } | null>(null);
  const [adultIds, setAdultIds] = React.useState<string[]>([]);
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

  // Changing the form after a line asked puts the question away: the next
  // save asks again if it still needs to.
  React.useEffect(() => {
    const sub = form.watch(() => setLineAsk(null));
    return () => sub.unsubscribe();
  }, [form]);

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
            ? "yes, they're partners"
            : s.suggestedType === "parent"
              ? "yes, add the parent"
              : s.suggestedType === "duplicate_check"
                ? "yes, same person"
                : "yes",
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
  const pending = flowEdges({
    anchorId: showChain ? anchorId : "",
    inBetween: intermediateCount,
    links: watchedLinks,
    extraLinks: watchedExtra,
    members,
  });

  // Who could be a child and isn't the member's own (Step 98): asked "18 or
  // older?", and a "No", or a date of birth under 18, stops the save.
  const self =
    mode === "self"
      ? ({ kind: "new", index: 0 } as const)
      : selfPersonId
        ? ({ kind: "existing", id: selfPersonId } as const)
        : null;
  const askedAdult = newPeopleToAsk({
    people: watchedPeople,
    edges: pending,
    self,
  });
  const adultAnswerOf = (i: number) => {
    const fieldId = people.fields[i]?.id;
    return fieldId ? adultAnswers.get(fieldId) : undefined;
  };
  const askedName = (i: number) =>
    nameOf(i, i === 0 ? "this person" : `in-between person ${i}`);
  const underAge = minorRefusal({
    asked: askedAdult,
    people: watchedPeople,
    answers: new Map(
      askedAdult.flatMap((i) => {
        const a = adultAnswerOf(i);
        return a === undefined ? [] : [[i, a] as const];
      }),
    ),
    nameOf: askedName,
  });
  const adultUnanswered = askedAdult.some(
    (i) => adultAnswerOf(i) === undefined,
  );
  // Refused for being under 18: a Root or a Branch may hold their place
  // under their parent instead (Step 98.2), when that parent is on the tree.
  const refusedIndex = underAge
    ? askedAdult.find(
        (i) =>
          adultAnswerOf(i) === false ||
          ageFromBirth(watchedPeople[i]?.date_of_birth) === "minor",
      )
    : undefined;
  // The person being added is asked before their names (Step 98.3): a No
  // there means nothing to type, only a place to hold.
  const primaryAsked = askedAdult.includes(0);
  const primaryRefused = primaryAsked && adultAnswerOf(0) === false;
  const placeholderFor =
    canAddPlaceholder && refusedIndex !== undefined
      ? placeholderParents({
          index: refusedIndex,
          edges: pending,
          parentsOf: (id) =>
            members.find((m) => m.id === id)?.parents?.map((p) => p.id) ?? [],
        })
      : [];

  const tieWarning = (() => {
    if (!bloodline || !gateActive || !showChain || !anchorId) return null;
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
    yesIds: string[] = adultIds,
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
      // Each person's "18 or older?" answer, for those asked (Step 98).
      adults: values.people.map((_, i) =>
        askedAdult.includes(i) ? (adultAnswerOf(i) ?? null) : null,
      ),
      adultIds: yesIds,
      inviteEmail: address || null,
      photoFollows: file !== null,
    });

    if (result.askable?.length) return { askable: result.askable };
    if (result.askAdult) return { askAdult: result.askAdult };
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
    action.run("save", (): Promise<SaveOutcome> => save(values, edges, null), {
      onSuccess: ({ askable, askAdult, primaryId }) => {
        if (askAdult) {
          setLineAsk({
            ask: askAdult,
            refused: false,
            values,
            edges,
            resolved: null,
          });
          return;
        }
        if (askable) {
          // Asked first; the dialog's answers save it.
          setSuggestions(askable);
          setPendingSave({ values, edges });
          return;
        }
        land(primaryId);
      },
    });
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
      onSuccess: ({ askAdult, primaryId }) => {
        setPendingSave(null);
        setSuggestions([]);
        if (askAdult) {
          // Asked under the form, with the dialog's answers kept for the
          // save it sends again.
          setLineAsk({
            ask: askAdult,
            refused: false,
            values,
            edges,
            resolved,
          });
          return;
        }
        land(primaryId);
      },
    });
  }

  /** "18 or older?" answered for someone a line asked about (Step 98). */
  function onLineAnswer(adult: boolean) {
    if (!lineAsk) return;
    if (!adult) {
      setLineAsk({ ...lineAsk, refused: true });
      return;
    }
    const { ask, values, edges, resolved } = lineAsk;
    const yesIds = [...adultIds, ask.id];
    setAdultIds(yesIds);
    setLineAsk(null);
    action.run("save", () => save(values, edges, resolved, yesIds), {
      onSuccess: ({ askAdult, primaryId }) => {
        if (askAdult) {
          setLineAsk({
            ask: askAdult,
            refused: false,
            values,
            edges,
            resolved,
          });
          return;
        }
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

  const adultQuestion = (i: number) => {
    const fieldId = people.fields[i]?.id ?? String(i);
    return (
      <AdultQuestion
        key={fieldId}
        name={askedName(i)}
        value={adultAnswerOf(i)}
        disabled={action.pending}
        onChange={(adult) =>
          setAdultAnswers((prev) => new Map(prev).set(fieldId, adult))
        }
      />
    );
  };
  // Under 18, and who may hold their place instead (Step 98.2).
  const refusal = underAge ? (
    <>
      <p role="alert" className="text-sm font-medium text-destructive">
        {underAge}
      </p>
      {placeholderFor.length > 0 ? (
        <AddPlaceholderButton
          treeId={treeId}
          parents={placeholderFor}
          nameOf={(id) =>
            members.find((m) => m.id === id)?.label ?? "their parent"
          }
          disabled={action.pending}
        />
      ) : null}
    </>
  ) : null;

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="flex flex-col gap-8" noValidate>
        {primaryAsked ? (
          <div className="flex flex-col gap-3">
            {adultQuestion(0)}
            {refusedIndex === 0 ? refusal : null}
          </div>
        ) : null}

        {/* No heading over the names and no line explaining the form: the
            labels say it (Step 58). */}
        {primaryRefused ? null : (
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
        )}

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
                                    j > 1
                                      ? `intermediate-${j - 1}-remove`
                                      : null,
                                    addInBetweenButton,
                                  );
                                }}
                              >
                                remove
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
                      add someone in between
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
                                extraLinks.append({
                                  targetId: "",
                                  kind: "child",
                                });
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
                                    remove
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
                                        {
                                          shouldDirty: true,
                                          shouldValidate: true,
                                        },
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
                                    form.setValue(
                                      `extraLinks.${i}.targetId`,
                                      id,
                                      {
                                        shouldDirty: true,
                                        shouldValidate: true,
                                      },
                                    )
                                  }
                                />
                                {form.formState.errors.extraLinks?.[i]
                                  ?.targetId ? (
                                  <p className="text-xs font-medium text-destructive">
                                    {
                                      form.formState.errors.extraLinks[i]
                                        ?.targetId?.message
                                    }
                                  </p>
                                ) : null}
                                {watchedExtra[i]?.kind === "child" ? (
                                  <CoParentOffer
                                    idBase={`extra-${i}`}
                                    partners={
                                      members.find(
                                        (m) =>
                                          m.id === watchedExtra[i]?.targetId,
                                      )?.partners ?? []
                                    }
                                    chosen={
                                      watchedExtra[i]?.coParentIds ?? null
                                    }
                                    parentLabel={
                                      members.find(
                                        (m) =>
                                          m.id === watchedExtra[i]?.targetId,
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
                                      for (const [k, v] of Object.entries(
                                        patch,
                                      )) {
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
                            add another connection
                          </Button>
                        ) : null}
                      </div>
                    ) : null}

                    {/* Someone in between is asked here; the person
                        being added was asked first, above. */}
                    {askedAdult.filter((i) => i !== 0).map(adultQuestion)}
                    {refusedIndex !== 0 ? refusal : null}

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

        {/* Nothing more to give of someone under 18 (Step 98.3). */}
        {primaryRefused ? null : compact && moreDetails ? (
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
              add more details
            </Button>
          </div>
        ) : null}

        {lineAsk ? (
          <div className="flex flex-col gap-2">
            <AdultQuestion
              name={lineAsk.ask.name ?? "this person"}
              value={lineAsk.refused ? false : undefined}
              disabled={action.pending}
              onChange={onLineAnswer}
            />
            {lineAsk.refused ? (
              <p role="alert" className="text-sm font-medium text-destructive">
                {underAgeMessage(lineAsk.ask.name)}
              </p>
            ) : null}
          </div>
        ) : null}

        <FormError>{action.error}</FormError>

        <PendingButton
          type="submit"
          pending={action.pending}
          pendingLabel="saving…"
          disabled={
            photo.busy ||
            !form.formState.isValid ||
            (needAnchor && !anchorId) ||
            underAge !== null ||
            adultUnanswered ||
            lineAsk !== null
          }
        >
          {mode === "self"
            ? "add me to the tree"
            : invitesOnSave
              ? "add relative & send invite"
              : "add relative"}
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
