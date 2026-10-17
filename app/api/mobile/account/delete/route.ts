import { type NextRequest, NextResponse } from "next/server";

import { readDeleteAccountRequest } from "@/lib/account-deletion";
import { deleteAccountOf } from "@/lib/account-deletion.server";
import { revalidateTreePages } from "@/lib/revalidate";
import { bearerClient, bearerToken } from "@/lib/supabase/bearer";

const NO_STORE = { "Cache-Control": "private, no-store" };

function answer(body: object, status = 200) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

/**
 * `POST /api/mobile/account/delete` (Step 176): the phone deletes the
 * signed-in member's own account, as the web's `deleteAccount` does
 * (`deleteAccountOf`). The body names who takes over each tree they're the
 * only Root of (`successors`, by tree id) and the trees nobody else is on,
 * which they agreed go too (`deleteTrees`). Successors are made Roots and
 * lone trees deleted as the member, through their bearer client; the
 * hand-over and the deletion itself run with the service role.
 *
 * No profile is needed: someone who signed up on the phone but isn't on a
 * tree yet has only a sign-in, and deleting removes that.
 *
 * Answers `{ deleted: true }`; refused, `{ error }` with 422. The session
 * the token came from is gone with the account: the phone signs out locally.
 */
export async function POST(request: NextRequest) {
  const token = bearerToken(request);
  const auth = token ? await bearerClient(token) : null;
  if (!auth) return answer({ error: "Sign in again." }, 401);

  const read = readDeleteAccountRequest(await request.json().catch(() => null));
  if ("problem" in read) return answer({ error: read.problem }, 400);

  const { successors, deleteTrees } = read.request;
  try {
    const { error } = await deleteAccountOf(
      auth.userId,
      successors,
      {
        kind: "self",
        promote: async (treeId, successorId) => {
          const { data, error } = await auth.supabase.rpc("set_member_role", {
            p_tree: treeId,
            p_user: successorId,
            p_role: "admin",
          });
          return !error && data === "admin";
        },
        deleteTree: async (treeId) => {
          const { error } = await auth.supabase.rpc("delete_tree", { p_tree: treeId });
          return !error;
        },
      },
      deleteTrees,
    );
    if (error) return answer({ error }, 422);
  } catch (error) {
    console.error("delete account", error);
    return answer({ error: "Couldn’t delete your account. Try again." }, 502);
  }

  revalidateTreePages();
  return answer({ deleted: true });
}
