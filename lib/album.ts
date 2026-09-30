import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * A photo in someone's album (Step 88.5), as their details show it: who
 * added it, when, what it's of, and who else is in it. A photo is uploaded
 * once and tagged with each person in it; each tag waits for approval on
 * its own, from the person themself once they have claimed the entry, or
 * else from whoever can edit it. Until then only they and its uploader see
 * it in that album (`album_tags` RLS). It shows wherever the entry does in
 * full, to that tree's members.
 */
export type AlbumPhoto = {
  id: string;
  /** Sized for the album (a storage transform), signed for an hour. */
  url: string | null;
  /** The whole photo, signed for an hour. */
  fullUrl: string | null;
  description: string | null;
  createdAt: string;
  /** Who added it, as the trees name them. */
  addedBy: string;
  /** The viewer added it, so may delete it. */
  mine: boolean;
  /** Whether it's in this album yet. */
  status: AlbumStatus;
  /** Waiting, and the viewer may approve it. */
  canDecide: boolean;
  /** The viewer may take it out of this album. */
  canRemove: boolean;
  /** Who else is in it, as far as the viewer may see. */
  others: { id: string; name: string; status: AlbumStatus }[];
};

export type AlbumStatus = "pending" | "approved" | "declined";

/** How long a photo's link lasts: longer than anyone keeps a sheet open. */
const PHOTO_LINK_SECONDS = 60 * 60;

/**
 * The album's own size (Step 88.5): each photo fits a square this wide,
 * twice the sheet's width, so it's sharp on a phone's screen and a few
 * dozen KB rather than the whole upload.
 */
export const ALBUM_VIEW_EDGE = 800;

function asStatus(status: string | null | undefined): AlbumStatus {
  return status === "approved" || status === "declined" ? status : "pending";
}

function asOthers(value: unknown): AlbumPhoto["others"] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((o) =>
    o && typeof o === "object" && typeof o.id === "string"
      ? [{ id: o.id, name: typeof o.name === "string" && o.name ? o.name : "Someone", status: asStatus(o.status) }]
      : [],
  );
}

/**
 * The photos in someone's album the viewer may see, newest first: one call
 * for the lot (`entry_album`, which runs as the viewer), one to sign the
 * whole photos, and one a photo for the album's size (storage signs a
 * transform one path at a time), all at once.
 */
export async function listAlbum(
  personId: string,
  viewerId: string,
): Promise<AlbumPhoto[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("entry_album", {
    p_person: personId,
  });
  if (error) throw new Error("Couldn’t read the album.");
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const bucket = supabase.storage.from("album");
  const paths = rows.map((r) => r.file_path);
  const [full, views] = await Promise.all([
    bucket.createSignedUrls(paths, PHOTO_LINK_SECONDS),
    Promise.all(
      paths.map((path) =>
        bucket.createSignedUrl(path, PHOTO_LINK_SECONDS, {
          transform: { width: ALBUM_VIEW_EDGE, height: ALBUM_VIEW_EDGE, resize: "contain" },
        }),
      ),
    ),
  ]);
  const fullByPath = new Map<string, string>();
  for (const s of full.data ?? []) {
    if (s.path && s.signedUrl) fullByPath.set(s.path, s.signedUrl);
  }

  return rows.map((r, i) => {
    const fullUrl = fullByPath.get(r.file_path) ?? null;
    return {
      id: r.id,
      // Where storage wouldn't size it, the whole photo does.
      url: views[i]?.data?.signedUrl ?? fullUrl,
      fullUrl,
      description: r.description ?? null,
      createdAt: r.created_at,
      addedBy: r.added_by || "A relative",
      mine: r.created_by === viewerId,
      status: asStatus(r.status),
      canDecide: r.can_decide ?? false,
      canRemove: r.can_untag ?? false,
      others: asOthers(r.others),
    };
  });
}
