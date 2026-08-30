"use client";

import * as React from "react";

import { PersonDocuments } from "@/components/person-documents";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  personDisplayName,
  personInitials,
  personLifespan,
} from "@/lib/person-name";
import type { TreeGraphPerson } from "@/lib/tree";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

export function PersonPanel({
  person,
  treeId,
  isAdmin,
  isSelf,
  canEdit,
  onClose,
}: {
  person: TreeGraphPerson | null;
  treeId: string;
  isAdmin: boolean;
  isSelf: boolean;
  canEdit: boolean;
  onClose: () => void;
}) {
  const open = person !== null;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <SheetContent className="w-full gap-0 overflow-y-auto sm:max-w-md">
        {person ? (
          <>
            <SheetHeader className="gap-3">
              <div className="flex items-center gap-3">
                <Avatar size="lg">
                  {person.photo_url ? (
                    <AvatarImage src={person.photo_url} alt="" />
                  ) : null}
                  <AvatarFallback>{personInitials(person)}</AvatarFallback>
                </Avatar>
                <div className="min-w-0">
                  <SheetTitle className="truncate">
                    {personDisplayName(person)}
                  </SheetTitle>
                  <SheetDescription>
                    {personLifespan(person) ?? "Living"}
                    {isSelf ? " · Your entry" : ""}
                  </SheetDescription>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {person.is_deceased ? (
                  <Badge variant="secondary">Deceased</Badge>
                ) : null}
                {isAdmin && person.lineage_type ? (
                  <Badge variant="outline">Lineage: {person.lineage_type}</Badge>
                ) : null}
              </div>
            </SheetHeader>

            <div className="flex flex-col gap-6 px-4 pb-6">
              <dl className="grid grid-cols-2 gap-4">
                <Field label="Given name" value={person.given_name} />
                <Field label="Preferred name" value={person.preferred_name} />
                <Field label="Family name" value={person.family_name} />
                <Field
                  label="Date of birth"
                  value={person.date_of_birth}
                />
                <Field
                  label="Place of birth"
                  value={
                    [person.city_of_birth, person.country_of_birth]
                      .filter(Boolean)
                      .join(", ") || null
                  }
                />
                {person.is_deceased ? (
                  <>
                    <Field
                      label="Date of death"
                      value={person.date_of_death}
                    />
                    <Field
                      label="Place of death"
                      value={person.place_of_death}
                    />
                  </>
                ) : null}
              </dl>

              <section className="border-t border-border pt-5">
                <PersonDocuments personId={person.id} treeId={treeId} />
              </section>

              <section className="flex flex-col gap-2 border-t border-border pt-5">
                <h2 className="text-sm font-semibold">Comments &amp; flags</h2>
                <p className="text-sm text-muted-foreground">
                  Flagging entries for review and discussion arrives in a later
                  step.
                </p>
              </section>

              <section className="flex flex-col gap-2 border-t border-border pt-5">
                <h2 className="text-sm font-semibold">Manage</h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled>
                    {canEdit ? "Edit entry" : "Edit (owner only)"}
                  </Button>
                  {!isSelf ? (
                    <Button variant="outline" size="sm" disabled>
                      Claim as me
                    </Button>
                  ) : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  Editing and claiming are wired up in the next steps.
                </p>
              </section>
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
