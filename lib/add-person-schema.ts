import { z } from "zod";

import { RELATIONSHIP_KINDS } from "@/lib/connections";
import { isEmailAddress } from "@/lib/email-address";
import { marriageDateProblems } from "@/lib/partial-date";
import { personSchema } from "@/lib/person-schema";
import type { SpouseDates } from "@/lib/spouse-dates";

/**
 * The add-a-relative form (`components/add-person-flow.tsx`): who's being
 * added, the people in between, the lines to the tree and an invite, as the
 * form holds and checks them.
 */

/** Multi-connection cap — keeps the one submit transaction small (Task 11.4). */
export const MAX_EXTRA_CONNECTIONS = 10;

/** Optional marriage / divorce fields carried on a spouse link (Step 11.5). */
const spouseDatesShape = {
  marriage_date: z.string().optional(),
  is_divorced: z.boolean().optional(),
  divorce_date: z.string().optional(),
};

/**
 * A link's marriage dates are only checked while it is a spouse link: one
 * switched to "child" keeps its old dates in the form, and they mustn't hold
 * up a submit they no longer belong to.
 */
function spouseDateIssues(
  link: SpouseDates & { kind: string },
): { path: "marriage_date" | "divorce_date"; message: string }[] {
  if (link.kind !== "spouse") return [];
  const { marriage, divorce } = marriageDateProblems({
    marriageDate: link.marriage_date,
    isDivorced: link.is_divorced,
    divorceDate: link.divorce_date,
  });
  return [
    ...(marriage ? [{ path: "marriage_date" as const, message: marriage }] : []),
    ...(divorce ? [{ path: "divorce_date" as const, message: divorce }] : []),
  ];
}

export const flowSchema = z.object({
  people: z.array(personSchema).min(1),
  anchorId: z.string(),
  links: z.array(
    z.object({
      kind: z.enum(RELATIONSHIP_KINDS),
      /** Sibling links only — also connect to the sibling's parents. */
      linkToParents: z.boolean().optional(),
      /**
       * Child links only — the anchor's partners to record as a second parent.
       * Ids, so a partner deselected by hand stays deselected.
       */
      coParentIds: z.array(z.string()).optional(),
      ...spouseDatesShape,
    }).superRefine((link, ctx) => {
      for (const issue of spouseDateIssues(link)) {
        ctx.addIssue({
          code: "custom",
          message: issue.message,
          path: [issue.path],
        });
      }
    }),
  ),
  extraLinks: z
    .array(
      z.object({
        targetId: z.string().min(1, "Pick someone on the tree."),
        kind: z.enum(RELATIONSHIP_KINDS),
        /** Child links only — the target's partners to record as a parent too. */
        coParentIds: z.array(z.string()).optional(),
        ...spouseDatesShape,
      }).superRefine((link, ctx) => {
        for (const issue of spouseDateIssues(link)) {
          ctx.addIssue({
            code: "custom",
            message: issue.message,
            path: [issue.path],
          });
        }
      }),
    )
    .max(MAX_EXTRA_CONNECTIONS)
    .superRefine((rows, ctx) => {
      const seen = new Set<string>();
      rows.forEach((r, i) => {
        const key = `${r.targetId}:${r.kind}`;
        if (r.targetId && seen.has(key)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "This is the same connection twice.",
            path: [i, "targetId"],
          });
        }
        seen.add(key);
      });
    }),
  /** Invite the new person to claim their entry once it's saved. */
  inviteEmail: z.string().optional(),
}).superRefine((values, ctx) => {
  // Only asked, and only sent, while they're living.
  const address = inviteAddress(values);
  if (address && !isEmailAddress(address)) {
    ctx.addIssue({
      code: "custom",
      message: "That doesn't look like an email address.",
      path: ["inviteEmail"],
    });
  }
});
export type FlowValues = z.infer<typeof flowSchema>;

/** Where the invite goes, or "" for none: a deceased person gets no invite. */
export function inviteAddress(values: {
  people: { is_deceased: boolean }[];
  inviteEmail?: string;
}): string {
  if (values.people[0]?.is_deceased) return "";
  return (values.inviteEmail ?? "").trim();
}
