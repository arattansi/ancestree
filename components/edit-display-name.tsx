"use client";

import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import { updateDisplayName } from "@/app/actions/profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Inline editor for a member's own display name, shown as the account card
 * title. Collapsed to a label + pencil until you choose to edit.
 */
export function EditDisplayName({ name }: { name: string | null }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(name ?? "");
  const [saving, setSaving] = React.useState(false);

  async function onSave(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const res = await updateDisplayName(value);
    setSaving(false);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success("Name updated.");
    if (res.displayName) setValue(res.displayName);
    setEditing(false);
    router.refresh();
  }

  if (!editing) {
    return (
      <span className="flex items-center gap-2">
        <span>{name ?? "Member"}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="Edit your name"
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
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={saving}
          onClick={() => {
            setValue(name ?? "");
            setEditing(false);
          }}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
