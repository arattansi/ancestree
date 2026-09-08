"use client";

import { Checkbox } from "@/components/ui/checkbox";
import { coParentSelection, type PartnerOption } from "@/lib/connections";

/**
 * "Who else is a parent?" — shown wherever a form is about to create a parent
 * edge, because `connect_people` records one parent per edge and nothing else
 * asks about the other one.
 *
 * Presentational: the selection rule lives in `coParentSelection`, and the
 * caller owns the state (react-hook-form in the add flow, `useState` on the
 * edit page). `chosen` is null until the member touches it.
 */
export function CoParentOffer({
  idBase,
  partners,
  chosen,
  onChange,
  /** Named on a former partner's line, e.g. "Ashif Suleman's former partner". */
  parentLabel,
}: {
  idBase: string;
  partners: PartnerOption[];
  chosen: string[] | null;
  onChange: (ids: string[]) => void;
  parentLabel?: string;
}) {
  if (partners.length === 0) return null;
  const selected = coParentSelection(chosen, partners);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs font-medium">Who else is a parent?</p>
      {partners.map((partner) => (
        <label
          key={partner.id}
          className="flex items-start gap-2 text-xs text-muted-foreground"
        >
          <Checkbox
            id={`${idBase}-coparent-${partner.id}`}
            checked={selected.includes(partner.id)}
            onCheckedChange={(c) =>
              onChange(
                c === true
                  ? [...selected, partner.id]
                  : selected.filter((id) => id !== partner.id),
              )
            }
          />
          <span>
            {partner.label} is also a parent
            {partner.isDivorced
              ? ` — ${parentLabel ? `${parentLabel}'s ` : "a "}former partner`
              : ""}
            .
          </span>
        </label>
      ))}
    </div>
  );
}
