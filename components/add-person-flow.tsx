"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { z } from "zod";

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
import { NewCanvasPrompt } from "@/components/new-canvas-prompt";
import { PersonFields } from "@/components/person-fields";
import { PhotoPicker } from "@/components/photo-picker";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
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
  buildChainEdges,
  KIND_STATEMENT,
  RELATIONSHIP_KINDS,
  type PersonRef,
  type RelationshipKind,
} from "@/lib/connections";
import { DEFAULT_CROP, type CropTransform } from "@/lib/image-crop";
import { personDisplayName } from "@/lib/person-name";
import { emptyPersonValues, personSchema } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

/** Multi-connection cap — keeps the one submit transaction small (Task 11.4). */
const MAX_EXTRA_CONNECTIONS = 10;

type SpouseDates = {
  marriage_date?: string;
  is_divorced?: boolean;
  divorce_date?: string;
};

/** Normalise a spouse link's optional marriage/divorce fields for an edge. */
function spouseDates(link: SpouseDates | undefined) {
  return {
    marriage_date: link?.marriage_date?.trim() ? link.marriage_date : null,
    is_divorced: link?.is_divorced ?? false,
    divorce_date:
      link?.is_divorced && link?.divorce_date?.trim()
        ? link.divorce_date
        : null,
  };
}

/** Optional marriage / divorce fields carried on a spouse link (Step 11.5). */
const spouseDatesShape = {
  marriage_date: z.string().optional(),
  is_divorced: z.boolean().optional(),
  divorce_date: z.string().optional(),
};

function SpouseDatesFields({
  idBase,
  value,
  onPatch,
}: {
  idBase: string;
  value: SpouseDates;
  onPatch: (patch: SpouseDates) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed border-border p-3">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${idBase}-marriage`} className="text-xs font-normal">
          Marriage date (optional)
        </Label>
        <Input
          id={`${idBase}-marriage`}
          type="date"
          value={value.marriage_date ?? ""}
          onChange={(e) => onPatch({ marriage_date: e.target.value })}
        />
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
          <Input
            id={`${idBase}-divorce`}
            type="date"
            value={value.divorce_date ?? ""}
            onChange={(e) => onPatch({ divorce_date: e.target.value })}
          />
        </div>
      ) : null}
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
      ...spouseDatesShape,
    }),
  ),
  extraLinks: z
    .array(
      z.object({
        targetId: z.string().min(1, "Pick someone on the tree."),
        kind: z.enum(RELATIONSHIP_KINDS),
        ...spouseDatesShape,
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
});
type FlowValues = z.infer<typeof flowSchema>;

export function AddPersonFlow({
  mode,
  treeId,
  isAdmin,
  members,
  initialName,
  canvasInterestRegistered = false,
}: {
  mode: "self" | "relative";
  treeId: string;
  isAdmin: boolean;
  members: TreeMemberOption[];
  /** Pre-fills the primary person's name — onboarding carries over the name
   *  the member typed into the "is one of these you?" search (Step 15). */
  initialName?: { first_name?: string; last_name?: string };
  /** They have already put their name down for a tree of their own (Step
   *  14.3), so the gate prompt thanks them instead of asking again. */
  canvasInterestRegistered?: boolean;
}) {
  const router = useRouter();
  const mustConnect = !isAdmin;
  const [connecting, setConnecting] = React.useState(
    mustConnect || members.length > 0,
  );
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [crop, setCrop] = React.useState<CropTransform>(DEFAULT_CROP);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  // The bloodline gate refused this branch (Step 14) — answer with the prompt
  // rather than leaving a dead-end error under the button.
  const [canvasPrompt, setCanvasPrompt] = React.useState(false);
  const [suggestions, setSuggestions] = React.useState<ImpliedConnection[]>([]);
  const [pendingSave, setPendingSave] = React.useState<{
    values: FlowValues;
    edges: ReturnType<typeof buildChainEdges>;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [addingMore, setAddingMore] = React.useState(false);

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
      anchorId: "",
      links: [{ kind: "child" }],
      extraLinks: [],
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

  const showChain = mustConnect || connecting;
  const needAnchor = showChain;
  const intermediateCount = people.fields.length - 1;

  const labelForRef = React.useCallback(
    (ref: PersonRef): string => {
      if (ref.kind === "existing") {
        return (
          members.find((m) => m.id === ref.id)?.label ?? "someone on the tree"
        );
      }
      const n = personDisplayName(watchedPeople[ref.index] ?? {});
      if (n !== "Unnamed person") return n;
      if (ref.index === 0) return mode === "self" ? "you" : "this person";
      return `person ${ref.index}`;
    },
    [members, watchedPeople, mode],
  );

  if (mustConnect && members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No one is on the family tree yet. An admin needs to add the first person
        before you can connect your entry.
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
  const primaryFallback = mode === "self" ? "You" : "this person";
  const primaryLabel = mode === "self" ? "You" : nameOf(0, "This person");

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

  const prompts: SuggestionPrompt[] = suggestions.map((s) => {
    const a = labelForRef(s.subject);
    const b = labelForRef(s.related);
    if (s.source === "co_parent") {
      return {
        suggestion: s,
        question: `Are ${a} and ${b} married or partners?`,
      };
    }
    if (s.source === "unlinked_spouse_child") {
      return {
        suggestion: s,
        question: `Is ${a} also a parent of ${labelForRef(s.child ?? s.related)}?`,
      };
    }
    return {
      suggestion: s,
      question: `${a} shares a last name and birth year with ${b} — are they related?`,
    };
  });

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
      people: values.people,
      edges,
      selfIndex: mode === "self" ? 0 : null,
      suggestions: resolved,
    });

    if (result.error || !result.personIds) {
      if (result.bloodlineGate) {
        setSubmitError(null);
        setCanvasPrompt(true);
        return false;
      }
      setSubmitError(result.error ?? "Couldn't save these entries.");
      return false;
    }

    const primaryId = result.personIds[0];
    if (photoFile && primaryId) {
      try {
        const path = await uploadPhoto(primaryId, photoFile);
        await setPersonPhoto(primaryId, path, crop);
      } catch {
        toast.warning("Saved — but the photo didn't upload. Add it later.");
      }
    }

    toast.success(
      mode === "self" ? "You're in the family tree." : "Relative added.",
    );
    router.replace("/tree");
    router.refresh();
    return true;
  }

  async function onSubmit(values: FlowValues) {
    setSubmitError(null);

    if (needAnchor && !values.anchorId) {
      setSubmitError("Choose someone already in the tree to connect to.");
      return;
    }

    let edges: ReturnType<typeof buildChainEdges> = [];
    if (showChain && values.anchorId) {
      const chainRefs: PersonRef[] = [];
      for (let i = 1; i <= intermediateCount; i += 1) {
        chainRefs.push({ kind: "new", index: i });
      }
      chainRefs.push({ kind: "new", index: 0 });
      edges = buildChainEdges(
        values.anchorId,
        chainRefs,
        values.links.map((l) => l.kind),
      );
      // buildChainEdges emits one edge per link, in order — carry the optional
      // marriage/divorce fields onto the spouse ones (Step 11.5).
      edges = edges.map((e, i) =>
        e.type === "spouse" ? { ...e, ...spouseDates(values.links[i]) } : e,
      );

      // "is a sibling of" the anchor + "also link to their parents": add a
      // parent edge from each of the anchor's known parents to the first chain
      // person, so the two actually render side by side as siblings.
      const firstLink = values.links[0];
      const anchorMember = members.find((m) => m.id === values.anchorId);
      if (
        firstLink?.kind === "sibling" &&
        firstLink.linkToParents &&
        anchorMember?.parents?.length
      ) {
        for (const parent of anchorMember.parents) {
          edges.push({
            type: "parent",
            a: { kind: "existing", id: parent.id },
            b: chainRefs[0],
          });
        }
      }
    }

    // Task 11.4 — additional connections from the primary new person to other
    // existing members. `members` is already scoped to this tree, and the RPC
    // re-checks every target belongs to the tree (rejects cross-tree rows).
    for (const row of values.extraLinks) {
      if (!row.targetId) continue;
      const [edge] = buildChainEdges(
        row.targetId,
        [{ kind: "new", index: 0 }],
        [row.kind],
      );
      edges = edges.concat(
        edge.type === "spouse" ? { ...edge, ...spouseDates(row) } : edge,
      );
    }

    const detected = await detectConnections({
      newPeople: values.people.map((p) => ({
        familyName: p.last_name,
        dateOfBirth: p.date_of_birth || null,
      })),
      pendingEdges: edges,
    });

    if (detected.suggestions && detected.suggestions.length > 0) {
      setSuggestions(detected.suggestions);
      setPendingSave({ values, edges });
      return;
    }

    await persist(values, edges, []);
  }

  async function onResolve(resolutions: SuggestionResolution[]) {
    if (!pendingSave) return;
    setSaving(true);
    const resolved = suggestions.map((s, i) => ({
      subject: s.subject,
      related: s.related,
      suggested_type: s.suggestedType,
      source: s.source,
      resolution: resolutions[i],
    }));
    const ok = await persist(pendingSave.values, pendingSave.edges, resolved);
    setSaving(false);
    if (ok) {
      setPendingSave(null);
      setSuggestions([]);
    }
  }

  const submitting = form.formState.isSubmitting || photoBusy || saving;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-8"
        noValidate
      >
        <section className="flex flex-col gap-6">
          <div>
            <h2 className="text-base font-semibold">
              {mode === "self" ? "Your details" : "Their details"}
            </h2>
            <p className="text-sm text-muted-foreground">
              A name and country of birth are required.
            </p>
          </div>
          <PersonFields
            control={form.control}
            isAdmin={isAdmin}
            prefix="people.0"
            idPrefix="primary"
          />

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
        </section>

        <section className="flex flex-col gap-4 border-t border-border pt-6">
          <div>
            <h2 id="connect-heading" className="text-base font-semibold">
              Connect to the family tree
            </h2>
            <p className="text-sm text-muted-foreground">
              {mustConnect
                ? "Every entry must connect to someone already in the tree. If the person in between isn't here yet, add them below."
                : "Admins can add a root person without a connection."}
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
                members={members}
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
                          value={watchedLinks[i]?.kind ?? "child"}
                          onValueChange={(v) =>
                            form.setValue(
                              `links.${i}.kind`,
                              v as RelationshipKind,
                              { shouldDirty: true },
                            )
                          }
                        >
                          <SelectTrigger className="w-[210px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {RELATIONSHIP_KINDS.map((k) => (
                              <SelectItem key={k} value={k}>
                                {linkSubject(i)} {KIND_STATEMENT[k]}{" "}
                                {linkObject(i)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <span className="font-medium">{linkObject(i)}</span>
                      </div>
                      {watchedLinks[i]?.kind === "spouse" ? (
                        <SpouseDatesFields
                          idBase={`link-${i}`}
                          value={watchedLinks[i] ?? {}}
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
                        <PersonFields
                          control={form.control}
                          isAdmin={isAdmin}
                          prefix={`people.${j}`}
                          idPrefix={`intermediate-${j}`}
                        />
                      </div>
                    );
                  })}

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
                    connect{primaryFallback === "You" ? "" : "s"} through each
                    person to {anchorLabel}.
                  </p>

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
                                value={watchedExtra[i]?.kind ?? "child"}
                                onValueChange={(v) =>
                                  form.setValue(
                                    `extraLinks.${i}.kind`,
                                    v as RelationshipKind,
                                    { shouldDirty: true, shouldValidate: true },
                                  )
                                }
                              >
                                <SelectTrigger className="w-[210px]">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {RELATIONSHIP_KINDS.map((k) => (
                                    <SelectItem key={k} value={k}>
                                      {primaryLabel} {KIND_STATEMENT[k]}
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
                            {watchedExtra[i]?.kind === "spouse" ? (
                              <SpouseDatesFields
                                idBase={`extra-${i}`}
                                value={watchedExtra[i] ?? {}}
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
                </div>
              ) : null}
            </div>
          ) : null}
        </section>

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

      <NewCanvasPrompt
        open={canvasPrompt}
        onOpenChange={setCanvasPrompt}
        alreadyRegistered={canvasInterestRegistered}
      />
    </Form>
  );
}
