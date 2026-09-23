"use client";

import Link from "next/link";

import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RequestFormState } from "@/lib/request-forms";

/**
 * First name, last name and email: the fields of every form someone fills in
 * before they have an account (`lib/request-forms.ts` reads them). After a
 * failed submit they show what was typed, and mark the field at fault.
 * `idPrefix` keeps ids apart where two of these forms share a page.
 *
 * Each input remounts when the value it restores changes: Base UI's input
 * warns when its default changes after it has mounted. Every default is a
 * string, so a field sent back empty doesn't change it from none to "".
 */
export function NameEmailFields({
  idPrefix,
  state,
  errorId,
}: {
  idPrefix: string;
  /** The last submit's result: what they typed, and which field was wrong. */
  state: RequestFormState;
  /** The id of the error message, when one shows. */
  errorId?: string;
}) {
  const badName = state.errorField === "name";
  const badEmail = state.errorField === "email";
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-first-name`}>First name</Label>
          <Input
            key={state.firstName ?? ""}
            id={`${idPrefix}-first-name`}
            name="firstName"
            autoComplete="given-name"
            required
            defaultValue={state.firstName ?? ""}
            aria-invalid={badName || undefined}
            aria-describedby={badName ? errorId : undefined}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${idPrefix}-last-name`}>Last name</Label>
          <Input
            key={state.lastName ?? ""}
            id={`${idPrefix}-last-name`}
            name="lastName"
            autoComplete="family-name"
            required
            defaultValue={state.lastName ?? ""}
            aria-invalid={badName || undefined}
            aria-describedby={badName ? errorId : undefined}
          />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${idPrefix}-email`}>Email address</Label>
        <Input
          key={state.email ?? ""}
          id={`${idPrefix}-email`}
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          defaultValue={state.email ?? ""}
          placeholder="you@example.com"
          aria-invalid={badEmail || undefined}
          aria-describedby={badEmail ? errorId : undefined}
        />
      </div>
    </>
  );
}

/**
 * The agreement an invite request needs: approval leads straight into the
 * tree, so this is where they agree to what that shares.
 */
export function InviteConsent({
  id,
  checked,
  onCheckedChange,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <Label
      htmlFor={id}
      className="group/field-label flex items-start gap-2.5 text-sm font-normal text-muted-foreground"
    >
      <Checkbox
        id={id}
        name="consent"
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
        className="mt-0.5"
      />
      <span>
        If I&rsquo;m approved, I agree that my family details, photos, and
        documents will be shared with other members of this private tree, and I
        have read the{" "}
        <Link href="/privacy" target="_blank" className="underline underline-offset-4">
          privacy notice
        </Link>
        .
      </span>
    </Label>
  );
}
