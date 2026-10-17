import {
  soleRootTrees,
  type DeleteAccountRequest,
  type SoleRootTree,
} from "@/lib/account-deletion";
import { accountTypeOf } from "@/lib/account-types";
import { supabase } from "@/auth/supabase";

/**
 * Deleting your own account from the phone (Step 176), as the web's
 * account page does: first what it asks of you (who takes over each tree
 * you're the only Root of, and which trees go with you because nobody else
 * is on them), read as the member; then the deletion, which needs the
 * service role, so it goes through the web's server
 * (`/api/mobile/account/delete`).
 */

const SITE = process.env.EXPO_PUBLIC_SITE_URL ?? "https://www.ancestree.space";

/** The trees they run with no other Root, and who could take each over. */
export async function loadSoleRootTrees(userId: string): Promise<SoleRootTree[]> {
  const { data: trees, error } = await supabase
    .from("my_trees")
    .select("id, name, role")
    .order("joined_at");
  if (error) throw new Error("Couldn’t read your trees. Try again.");
  const own = (trees ?? []).flatMap((t) =>
    t.id ? [{ id: t.id, name: t.name ?? "Your tree", role: t.role }] : [],
  );
  const run = own.filter((t) => accountTypeOf(t.role).runsTree).map((t) => t.id);
  if (run.length === 0) return [];

  const { data: others, error: othersError } = await supabase
    .from("member_directory")
    .select("tree_id, auth_user_id, display_name, role")
    .in("tree_id", run)
    .neq("auth_user_id", userId);
  if (othersError) throw new Error("Couldn’t read your trees. Try again.");
  return soleRootTrees(own, others ?? []);
}

/**
 * Delete the account for good, then forget the session here: it went with
 * the account, so there's nothing to sign out of on the server.
 */
export async function deleteAccount(request: DeleteAccountRequest): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in again.");
  let response: Response;
  try {
    response = await fetch(`${SITE}/api/mobile/account/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(request),
    });
  } catch {
    throw new Error("No connection. Try again.");
  }
  const body = (await response.json().catch(() => null)) as {
    deleted?: boolean;
    error?: string;
  } | null;
  if (!response.ok || !body?.deleted) {
    throw new Error(body?.error ?? "Couldn’t delete your account. Try again.");
  }
  await supabase.auth.signOut({ scope: "local" });
}
