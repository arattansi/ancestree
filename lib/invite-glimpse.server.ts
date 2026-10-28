import "server-only";

import type * as React from "react";

import { signedCardPhotoUrls } from "@/lib/entry-view.server";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import {
  asGlimpseInput,
  claimRelation,
  glimpseRows,
  type GlimpseRow,
} from "@/lib/invite-glimpse";
import { createAdminClient } from "@/lib/supabase/admin";

/** What the join page shows of the tree (Step 215): only this leaves the server. */
export type InviteGlimpse = {
  rows: GlimpseRow[];
  /** Everyone on the tree, drawn or not. */
  people: number;
  /** "his wife", on a claim link (`claimRelation`). */
  relation: string | null;
  /** The inviter's family name, for a tree still called "Family". */
  inviterFamily: { maidenName: string | null; lastName: string | null };
  /** The inviter's photo, card-sized, with how their card frames it. */
  inviterPhoto: { url: string; style: React.CSSProperties } | null;
};

/**
 * The join page's picture of the tree, for a live invite into one; null for
 * anything else, a founder invite included. Read with the service role, as
 * `invite_glimpse` is for it alone: the people and lines it hands over
 * stay here, and the page gets leaf shapes, words and one photo.
 */
export async function readInviteGlimpse(token: string): Promise<InviteGlimpse | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("invite_glimpse", { p_token: token });
  const input = error ? null : asGlimpseInput(data);
  if (!input) return null;

  const photoRow = { photo_path: input.inviterPhotoPath, photo_crop: input.inviterPhotoCrop };
  const photoUrl = input.inviterPhotoPath
    ? (await signedCardPhotoUrls(admin, [photoRow]))(photoRow)
    : null;
  return {
    rows: glimpseRows(input),
    people: input.people.length,
    relation: claimRelation(input),
    inviterFamily: { maidenName: input.inviterMaidenName, lastName: input.inviterLastName },
    inviterPhoto: photoUrl
      ? { url: photoUrl, style: cropStyle(parseCrop(input.inviterPhotoCrop)) }
      : null,
  };
}
