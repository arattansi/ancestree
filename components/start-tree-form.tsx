"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";

import { startOwnTree } from "@/app/actions/trees";
import { PersonFields } from "@/components/person-fields";
import {
  RelationshipPicker,
  type TreeMemberOption,
} from "@/components/relationship-picker";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  emptyPersonValues,
  personSchema,
  type PersonFormValues,
} from "@/lib/person-schema";

/**
 * Minimal Step 9 seam: name a new tree, pick the relative it bridges through,
 * and describe your own entry on it. The new tree isn't rendered in v1.
 */
export function StartTreeForm({ members }: { members: TreeMemberOption[] }) {
  const router = useRouter();
  const [treeName, setTreeName] = React.useState("");
  const [bridgePersonId, setBridgePersonId] = React.useState("");
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  const form = useForm<PersonFormValues>({
    resolver: zodResolver(personSchema),
    mode: "onChange",
    defaultValues: emptyPersonValues,
  });

  const submitting = form.formState.isSubmitting;
  const canSubmit =
    !submitting &&
    treeName.trim().length > 0 &&
    bridgePersonId.length > 0 &&
    form.formState.isValid;

  async function onSubmit(values: PersonFormValues) {
    setSubmitError(null);
    const res = await startOwnTree({
      treeName,
      bridgePersonId,
      person: values,
    });
    if (res.error) {
      setSubmitError(res.error);
      return;
    }
    toast.success("Your tree was created and bridged to this one.");
    router.push("/tree");
    router.refresh();
  }

  if (members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        There&apos;s nobody on the tree yet to connect through. Add relatives
        first, then come back.
      </p>
    );
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="flex flex-col gap-6"
        noValidate
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="new-tree-name">New tree name</Label>
          <Input
            id="new-tree-name"
            value={treeName}
            onChange={(e) => setTreeName(e.target.value)}
            placeholder="e.g. The Suleman family"
            maxLength={120}
            required
          />
        </div>

        <div className="flex flex-col gap-2">
          <span id="bridge-person-label" className="text-sm font-medium">
            Bridges through
          </span>
          <p className="text-xs text-muted-foreground">
            Your new tree connects to this shared tree as the spouse / partner
            of the person you pick.
          </p>
          <RelationshipPicker
            members={members}
            value={bridgePersonId}
            onChange={setBridgePersonId}
            labelId="bridge-person-label"
            disabled={submitting}
          />
        </div>

        <div className="border-t border-border pt-6">
          <h2 className="mb-4 text-sm font-semibold">Your entry on the new tree</h2>
          <PersonFields
            control={form.control}
            isAdmin={false}
            idPrefix="start-tree"
          />
        </div>

        {submitError ? (
          <p role="alert" className="text-sm font-medium text-destructive">
            {submitError}
          </p>
        ) : null}

        <Button type="submit" disabled={!canSubmit}>
          {submitting ? "Creating…" : "Create my tree"}
        </Button>
      </form>
    </Form>
  );
}
