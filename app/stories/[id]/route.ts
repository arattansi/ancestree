import { NextResponse, type NextRequest } from "next/server";

import { readCurrentTreeId, setCurrentTreeCookie } from "@/lib/current-tree.server";
import { createClient } from "@/lib/supabase/server";
import { treeHref, treeStoryHref } from "@/lib/tree-links";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * `GET /stories/<id>`: a story's comments, from the link on its public page
 * (Step 88.4). Opens the person it's about on a tree of the member's that
 * shows them (the one they're looking at if it does), with the story's
 * comments open. Signed out, the proxy has them sign in first and come back
 * here. A story they can't see opens the canvas.
 */
export async function GET(request: NextRequest, ctx: RouteContext<"/stories/[id]">) {
  const { id } = await ctx.params;
  const canvas = NextResponse.redirect(new URL(treeHref(), request.url));
  if (!UUID.test(id)) return canvas;

  const supabase = await createClient();
  const current = await readCurrentTreeId();
  // Runs as them: nothing for a story they can't see, and a tree only
  // where they're a member and it shows the person in full.
  const { data } = await supabase.rpc("story_place", {
    p_story: id,
    p_prefer: current ?? undefined,
  });
  const place = data?.[0];
  if (!place?.person_id || !place.tree_id) return canvas;

  if (place.tree_id !== current) await setCurrentTreeCookie(place.tree_id);
  return NextResponse.redirect(
    new URL(treeStoryHref(place.person_id, id), request.url),
  );
}
