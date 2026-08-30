/**
 * Build-time feature flags. `NEXT_PUBLIC_*` values are inlined by Next, so these
 * are safe to read from both server and client components.
 */

/**
 * Multi-tree seam (Step 9). When enabled, members can start their own tree and
 * bridge it back to a tree they already belong to. The second tree is not
 * rendered in v1 — this only exposes the entry point and wires the data path.
 */
export const multiTreeEnabled =
  process.env.NEXT_PUBLIC_ENABLE_MULTI_TREE === "true";
