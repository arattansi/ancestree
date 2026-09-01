"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { toast } from "sonner";

import {
  addNickname,
  removeNickname,
  removeNicknameGroup,
} from "@/app/actions/nicknames";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  filterNicknameGroups,
  nicknameInputError,
  type NicknameGroup,
} from "@/lib/nicknames";

/**
 * Admin panel for the nickname groups behind the onboarding name search
 * (Step 15.1). The seed is English-centric, so this is where the family's own
 * nicknames get added — every pair here is a name someone is called *instead
 * of* their root name, not merely one that resembles it.
 */
export function AdminNicknames({ groups }: { groups: NicknameGroup[] }) {
  const router = useRouter();
  const [root, setRoot] = React.useState("");
  const [nickname, setNickname] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const visible = React.useMemo(
    () => filterNicknameGroups(groups, query),
    [groups, query],
  );

  async function onAdd(event: React.FormEvent) {
    event.preventDefault();
    const invalid = nicknameInputError(root, nickname);
    if (invalid) {
      setError(invalid);
      return;
    }

    setError(null);
    setSaving(true);
    const res = await addNickname(root, nickname);
    setSaving(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    toast.success(`Added to the ${res.canonical} group.`);
    setNickname("");
    router.refresh();
  }

  async function onRemove(canonical: string, variant: string) {
    setBusy(`${canonical}:${variant}`);
    const res = await removeNickname(canonical, variant);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    router.refresh();
  }

  async function onRemoveGroup(canonical: string) {
    setBusy(canonical);
    const res = await removeNicknameGroup(canonical);
    setBusy(null);
    if (res.error) {
      toast.error(res.error);
      return;
    }
    toast.success(`Removed the ${canonical} group.`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={onAdd} className="flex flex-col gap-3" noValidate>
        <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-root">Root name</Label>
            <Input
              id="nickname-root"
              placeholder="Robert"
              value={root}
              onChange={(e) => setRoot(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-variant">Goes by</Label>
            <Input
              id="nickname-variant"
              placeholder="Bob"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
          </div>
          <Button type="submit" disabled={saving}>
            {saving ? "Adding…" : "Add"}
          </Button>
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <p className="text-xs text-muted-foreground">
          Names are stored lowercase without accents or punctuation. Adding to
          an existing root extends that group; a new root starts one.
        </p>
      </form>

      <div className="flex flex-col gap-3 border-t border-border pt-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="nickname-search">Find a group</Label>
            <Input
              id="nickname-search"
              placeholder="bob"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="sm:w-64"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            {visible.length} of {groups.length} group
            {groups.length === 1 ? "" : "s"}
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {groups.length === 0
              ? "No nickname groups yet."
              : `Nothing matches "${query}".`}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {visible.map((g) => (
              <li
                key={g.canonical}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"
              >
                <span className="font-medium">{g.canonical}</span>
                <span aria-hidden className="text-muted-foreground">
                  →
                </span>
                {g.variants.length === 0 ? (
                  <span className="text-sm text-muted-foreground">
                    no nicknames yet
                  </span>
                ) : (
                  g.variants.map((v) => (
                    <span
                      key={v}
                      className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-sm"
                    >
                      {v}
                      <button
                        type="button"
                        aria-label={`Remove ${v} from ${g.canonical}`}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => onRemove(g.canonical, v)}
                        disabled={busy !== null}
                      >
                        ×
                      </button>
                    </span>
                  ))
                )}
                <button
                  type="button"
                  className="ml-auto text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
                  onClick={() => onRemoveGroup(g.canonical)}
                  disabled={busy !== null}
                >
                  {busy === g.canonical ? "Removing…" : "Remove group"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
