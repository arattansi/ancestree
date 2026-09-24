/**
 * Removing a member from a tree, in the admin console's words (Step 46).
 * `remove_tree_member` takes them off this tree and hands the Root what they
 * added here. Only when it was the last tree they were on does their profile
 * go, and `deleteMember` their login with it. A member of another tree keeps
 * both and stays there, so the confirm and the toast say which, and never
 * name another tree.
 */

type Removal = {
  /** Their display name, or "this member". */
  name: string;
  /** The tree they're being taken off. */
  treeName: string;
};

/**
 * What the Root is asked before removing someone. `onlyTree` is whether this
 * is the only tree they're on, or null when the console couldn't tell; the
 * words then hold either way.
 */
export function removeMemberConfirm({
  name,
  treeName,
  entryCount,
  onlyTree,
}: Removal & { entryCount: number; onlyTree: boolean | null }): string {
  const login =
    onlyTree === null
      ? "If it’s their only tree, their login goes too."
      : onlyTree
        ? "It’s their only tree, so their login goes too."
        : "They stay on their other trees.";
  const entries =
    entryCount === 0
      ? ""
      : entryCount === 1
        ? " Their 1 entry becomes yours."
        : ` Their ${entryCount} entries become yours.`;
  return `Remove ${name} from ${treeName}? ${login}${entries}\nThis cannot be undone.`;
}

/**
 * What the Root is told once they're off: whether their login went, as the
 * removal found it, even if the page was out of date when they asked.
 */
export function memberRemovedToast({
  name,
  treeName,
  loginDeleted,
}: Removal & { loginDeleted: boolean }): string {
  return loginDeleted
    ? `Removed ${name} from ${treeName}. Their login was deleted too.`
    : `Removed ${name} from ${treeName}. They’re still on their other trees.`;
}
