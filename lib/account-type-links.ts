import { isAccountTypeKey, type AccountTypeKey } from "@/lib/account-types";

/**
 * Whose entry is whose (Step 19.1): the account type of the member each
 * person on the tree belongs to, so the canvas can mark who the tree stems
 * from.
 *
 * A member's entry is linked two ways, and neither alone is enough.
 * Onboarding writes `profiles.self_person_id` and no claim, so both Roots have
 * no claim row; claiming an existing entry writes an approved `claims` row
 * (and sets `self_person_id` too). The union covers both. The profile link
 * wins if the two ever name different members for one entry.
 */
export function accountTypesByPerson(
  profiles: readonly {
    auth_user_id: string;
    role: string | null;
    self_person_id: string | null;
  }[],
  approvedClaims: readonly { person_id: string; claimant_user_id: string }[],
): Map<string, AccountTypeKey> {
  const roleByUser = new Map(profiles.map((p) => [p.auth_user_id, p.role]));
  const out = new Map<string, AccountTypeKey>();
  // An unrecognised role is left unmarked rather than shown as a Leaf: a
  // wrong label on someone's entry is worse than none.
  for (const p of profiles) {
    if (p.self_person_id && isAccountTypeKey(p.role)) {
      out.set(p.self_person_id, p.role);
    }
  }
  for (const c of approvedClaims) {
    if (out.has(c.person_id)) continue;
    const role = roleByUser.get(c.claimant_user_id);
    if (isAccountTypeKey(role)) out.set(c.person_id, role);
  }
  return out;
}
