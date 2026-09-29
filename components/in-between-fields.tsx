"use client";

import { Plus } from "lucide-react";
import * as React from "react";
import type { Control } from "react-hook-form";

import {
  PersonDetailFields,
  PersonFields,
  PersonNameFields,
} from "@/components/person-fields";
import { Button } from "@/components/ui/button";
import type { FlowValues } from "@/lib/add-person-schema";

/**
 * Someone in between, added in the same step. On the add-a-relative form
 * their name comes first and the rest on request, as for the person being
 * added (Step 44).
 */
export function InBetweenFields({
  control,
  isAdmin,
  index,
  compact,
}: {
  control: Control<FlowValues>;
  isAdmin: boolean;
  index: number;
  compact: boolean;
}) {
  const [open, setOpen] = React.useState(!compact);
  const prefix = `people.${index}`;
  const idPrefix = `intermediate-${index}`;
  if (!compact) {
    return (
      <PersonFields
        control={control}
        isAdmin={isAdmin}
        prefix={prefix}
        idPrefix={idPrefix}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <PersonNameFields control={control} prefix={prefix} />
      {open ? (
        <PersonDetailFields
          control={control}
          isAdmin={isAdmin}
          withDiedField
          prefix={prefix}
          idPrefix={idPrefix}
        />
      ) : (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="self-start px-0"
          onClick={() => setOpen(true)}
        >
          <Plus />
          More about them
        </Button>
      )}
    </div>
  );
}
