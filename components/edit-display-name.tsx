"use client";

import { Pencil } from "lucide-react";
import * as React from "react";

import { updateDisplayName } from "@/app/actions/profile";
import { FormError } from "@/components/form-error";
import { PendingButton } from "@/components/pending-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAction } from "@/components/use-action";
import { useFocusReturn } from "@/components/use-focus-return";

/**
 * Inline editor for a member's own display name, shown as the account card
 * title. Collapsed to a label + pencil until you choose to edit.
 */
export function EditDisplayName({ name }: { name: string | null }) {
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name ?? "");
  const action = useAction({ inline: true });
  const returnFocus = useFocusReturn();
  const pencilRef = React.useRef<HTMLButtonElement>(null);

  // Save and Cancel go with the form: focus goes back to the pencil.
  function close() {
    setEditing(false);
    returnFocus(() => pencilRef.current);
  }

  function onSave(event: React.FormEvent) {
    event.preventDefault();
    action.run("save", () => updateDisplayName(value), {
      onSuccess: (res) => {
        if (res.displayName) setValue(res.displayName);
        close();
      },
    });
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span>{name ?? "Member"}</span>
        <Button
          ref={pencilRef}
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Edit your name"
          className="relative tap-target"
          onClick={() => setEditing(true)}
        >
          <Pencil />
        </Button>
      </span>
    );
  }

  return (
    <form onSubmit={onSave} className="flex flex-col gap-2">
      <Label htmlFor="display-name" className="sr-only">
        Your name
      </Label>
      <Input
        id="display-name"
        value={value}
        autoFocus
        maxLength={60}
        onChange={(e) => setValue(e.target.value)}
        className="text-base font-normal"
      />
      <FormError>{action.error}</FormError>
      <div className="flex gap-2">
        <PendingButton
          type="submit"
          size="sm"
          pending={action.pending}
          pendingLabel="Saving…"
        >
          Save
        </PendingButton>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={action.pending}
          onClick={() => {
            setValue(name ?? "");
            action.setError(null);
            close();
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
