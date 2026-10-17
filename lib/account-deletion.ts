import { accountTypeOf } from "@/lib/account-types";

/**
 * What deleting your own account asks of you first, shared by the web's
 * account page and the phone (Step 176). Pure: the reads happen where it's
 * used, as the member, under RLS.
 */

export type SuccessorOption = { userId: string; name: string };

/**
 * A tree the member is the only Root of, and who could take it over. With
 * nobody (`successors` empty), nobody else is on it, and it is deleted with
 * the account (Step 176).
 */
export type SoleRootTree = {
  treeId: string;
  treeName: string;
  successors: SuccessorOption[];
};

/** A tree as `my_trees` lists it: what the member is there. */
export type OwnTree = { id: string; name: string; role: string | null };

/** Another member of one of their trees, as `member_directory` lists them. */
export type OtherMember = {
  tree_id: string | null;
  auth_user_id: string | null;
  display_name: string | null;
  role: string | null;
};

/**
 * Every tree they run with no other Root: who there could take over
 * (named with their account type), or nobody. `others` is everyone else on
 * the trees they run; anyone else in it is ignored.
 */
export function soleRootTrees(
  trees: readonly OwnTree[],
  others: readonly OtherMember[],
): SoleRootTree[] {
  const out: SoleRootTree[] = [];
  for (const t of trees) {
    if (!accountTypeOf(t.role).runsTree) continue;
    const here = others.filter(
      (m): m is OtherMember & { auth_user_id: string } =>
        m.tree_id === t.id && !!m.auth_user_id,
    );
    if (here.some((m) => accountTypeOf(m.role).runsTree)) continue;
    out.push({
      treeId: t.id,
      treeName: t.name,
      successors: here
        .map((m) => ({
          userId: m.auth_user_id,
          name: `${m.display_name ?? "Unnamed member"} (${accountTypeOf(m.role).name})`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }
  return out;
}

/** The trees nobody else is on, which go with the account. */
export function loneTrees(trees: readonly SoleRootTree[]): SoleRootTree[] {
  return trees.filter((t) => t.successors.length === 0);
}

/** Whether every tree with someone to hand it to has its successor chosen. */
export function everyTreeHandedOver(
  trees: readonly SoleRootTree[],
  successors: Readonly<Record<string, string>>,
): boolean {
  return trees.every((t) => t.successors.length === 0 || !!successors[t.treeId]);
}

/** The deletion the phone asks for: successors by tree, and trees to delete. */
export type DeleteAccountRequest = {
  successors: Record<string, string>;
  deleteTrees: string[];
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Reads `POST /api/mobile/account/delete`'s body: `{ successors?: { [treeId]:
 * userId }, deleteTrees?: treeId[] }`, every id a UUID. Anything else is a
 * problem to answer with a 400.
 */
export function readDeleteAccountRequest(
  body: unknown,
): { request: DeleteAccountRequest } | { problem: string } {
  const bad = { problem: "That request isn’t one the app sends." };
  if (body == null) return { request: { successors: {}, deleteTrees: [] } };
  if (typeof body !== "object" || Array.isArray(body)) return bad;
  const { successors = {}, deleteTrees = [] } = body as Record<string, unknown>;

  if (!successors || typeof successors !== "object" || Array.isArray(successors)) return bad;
  const named: Record<string, string> = {};
  for (const [tree, user] of Object.entries(successors)) {
    if (!UUID.test(tree) || typeof user !== "string" || !UUID.test(user)) return bad;
    named[tree] = user;
  }

  if (!Array.isArray(deleteTrees)) return bad;
  if (!deleteTrees.every((t) => typeof t === "string" && UUID.test(t))) return bad;

  return { request: { successors: named, deleteTrees: [...new Set(deleteTrees as string[])] } };
}
