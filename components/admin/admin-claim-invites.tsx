"use client";

import * as React from "react";
import Link from "next/link";

import { ClaimInviteControls } from "@/components/claim-invite-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Invitable } from "@/lib/invitable.server";
import { shortDate } from "@/lib/short-date";
import { treeFocusHref } from "@/lib/tree-links";

/** Names shown before "show all". */
const FIRST_SHOWN = 10;

/**
 * The Root console's list of everyone living on the tree that nobody is
 * behind yet (Step 143): beside each name, an invite by email, or a link
 * to send any other way. Each says when one went out already. Settings
 * shows the same list of the people a member added (Step 151), and so
 * does a founder's invite step (Step 162).
 */
export function AdminClaimInvites({
  treeId,
  treeName,
  people,
}: {
  treeId: string;
  treeName: string;
  people: Invitable[];
}) {
  const [query, setQuery] = React.useState("");
  const [all, setAll] = React.useState(false);

  if (people.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Everyone living on the tree has joined.
      </p>
    );
  }

  const q = query.trim().toLowerCase();
  const matching = q
    ? people.filter((p) => p.name.toLowerCase().includes(q))
    : people;
  const shown = all || q ? matching : matching.slice(0, FIRST_SHOWN);

  return (
    <div className="flex flex-col gap-3">
      {people.length > FIRST_SHOWN ? (
        <Input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find a name"
          aria-label="Find a name"
          autoComplete="off"
          className="sm:max-w-xs"
        />
      ) : null}
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
        {shown.map((p) => (
          <ClaimRow key={p.id} person={p} treeId={treeId} treeName={treeName} />
        ))}
      </ul>
      {matching.length === 0 ? (
        <p className="text-sm text-muted-foreground">No one by that name.</p>
      ) : null}
      {!all && !q && people.length > FIRST_SHOWN ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setAll(true)}
        >
          Show all {people.length}
        </Button>
      ) : null}
    </div>
  );
}

function ClaimRow({
  person,
  treeId,
  treeName,
}: {
  person: Invitable;
  treeId: string;
  treeName: string;
}) {
  const invite = person.invite;
  return (
    <li className="px-3 py-2.5">
      <ClaimInviteControls
        personId={person.id}
        personName={person.name}
        treeId={treeId}
        treeName={treeName}
        head={
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              href={treeFocusHref(person.id)}
              className="truncate text-sm font-medium hover:underline"
            >
              {person.name}
            </Link>
            {person.bornYear ? (
              <span className="text-xs text-muted-foreground">
                b. {person.bornYear}
              </span>
            ) : null}
            {invite ? (
              <Badge variant={invite.live ? "secondary" : "outline"}>
                {invite.live
                  ? `Invited ${shortDate(invite.sentAt)}`
                  : "Invite expired"}
              </Badge>
            ) : null}
          </div>
        }
      />
    </li>
  );
}
