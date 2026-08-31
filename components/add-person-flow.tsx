"use client";

import Image from "next/image";
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
import { PersonFields } from "@/components/person-fields";
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
import { compressImage } from "@/lib/image";
import { personDisplayName } from "@/lib/person-name";
import { emptyPersonValues, personSchema } from "@/lib/person-schema";
import { createClient } from "@/lib/supabase/client";

const flowSchema = z.object({
  people: z.array(personSchema).min(1),
  anchorId: z.string(),
  links: z.array(z.object({ kind: z.enum(RELATIONSHIP_KINDS) })),
});
type FlowValues = z.infer<typeof flowSchema>;

export function AddPersonFlow({
  mode,
  treeId,
  isAdmin,
  members,
}: {
  mode: "self" | "relative";
  treeId: string;
  isAdmin: boolean;
  members: TreeMemberOption[];
}) {
  const router = useRouter();
  const mustConnect = !isAdmin;
  const [connecting, setConnecting] = React.useState(
    mustConnect || members.length > 0,
  );
  const [photoFile, setPhotoFile] = React.useState<File | null>(null);
  const [photoBusy, setPhotoBusy] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<ImpliedConnection[]>([]);
  const [pendingSave, setPendingSave] = React.useState<{
    values: FlowValues;
    edges: ReturnType<typeof buildChainEdges>;
  } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const form = useForm<FlowValues>({
    resolver: zodResolver(flowSchema),
    mode: "onChange",
    defaultValues: {
      people: [emptyPersonValues],
      anchorId: "",
      links: [{ kind: "child" }],
    },
  });

  const people = useFieldArray({ control: form.control, name: "people" });
  const links = useFieldArray({ control: form.control, name: "links" });

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

  const photoPreview = React.useMemo(
    () => (photoFile ? URL.createObjectURL(photoFile) : null),
    [photoFile],
  );
  React.useEffect(() => {
    if (!photoPreview) return;
    return () => URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  if (mustConnect && members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No one is on the family tree yet. An admin needs to add the first
        person before you can connect your entry.
      </p>
    );
  }

  const nameOf = (idx: number, fallback: string) => {
    const n = personDisplayName(watchedPeople[idx] ?? {});
    return n === "Unnamed person" ? fallback : n;
  };
  const anchorLabel =
    members.find((m) => m.id === anchorId)?.label ?? "the tree";
  const primaryFallback = mode === "self" ? "You" : "this person";
  const primaryLabel = mode === "self" ? "You" : nameOf(0, "This person");

  // nodes = [anchor, intermediate_1 … intermediate_k, primary]
  const linkObject = (i: number) =>
    i === 0 ? anchorLabel : nameOf(i, `Person ${i}`);
  const linkSubject = (i: number) =>
    i + 1 <= intermediateCount
      ? nameOf(i + 1, `Person ${i + 1}`)
      : primaryLabel;

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
      return { suggestion: s, question: `Are ${a} and ${b} married or partners?` };
    }
    if (s.source === "unlinked_spouse_child") {
      return {
        suggestion: s,
        question: `Is ${a} also a parent of ${labelForRef(s.child ?? s.related)}?`,
      };
    }
    return {
      suggestion: s,
      question: `${a} shares a family name and birth year with ${b} — are they related?`,
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
      setSubmitError(result.error ?? "Couldn't save these entries.");
      return false;
    }

    const primaryId = result.personIds[0];
    if (photoFile && primaryId) {
      try {
        const path = await uploadPhoto(primaryId, photoFile);
        await setPersonPhoto(primaryId, path);
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
    }

    const detected = await detectConnections({
      newPeople: values.people.map((p) => ({
        familyName: p.family_name,
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

          <div className="flex flex-col gap-2">
            <Label htmlFor="primary-photo">Photo</Label>
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
                  id="primary-photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handlePhotoPick}
                  disabled={photoBusy}
                />
                <p className="text-xs text-muted-foreground">
                  Optional. JPEG, PNG, or WebP; resized on your device.
                </p>
                {photoFile ? (
                  <button
                    type="button"
                    className="self-start text-xs text-destructive underline underline-offset-2"
                    onClick={() => setPhotoFile(null)}
                  >
                    Remove selected photo
                  </button>
                ) : null}
              </div>
            </div>
          </div>
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
                      className="flex flex-wrap items-center gap-2 rounded-md border border-border p-3 text-sm"
                    >
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
                              {KIND_STATEMENT[k]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <span className="font-medium">{linkObject(i)}</span>
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
                    Reads top to bottom: {primaryFallback === "You" ? "you" : "the new entry"}{" "}
                    connect{primaryFallback === "You" ? "" : "s"} through each
                    person to {anchorLabel}.
                  </p>
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
            submitting ||
            !form.formState.isValid ||
            (needAnchor && !anchorId)
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
    </Form>
  );
}
