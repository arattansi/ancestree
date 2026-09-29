/**
 * How somebody came onto a tree (Step 86): who added their entry, and who
 * invited them to join it. Two different people as often as not — a Root
 * adds a cousin, and a Branch later sends the cousin the invite that claims
 * it — so both are kept, and said once when they're the same person.
 */

export type JoinedByMember = { id: string; name: string };

export type JoinedBy = {
  addedBy: JoinedByMember | null;
  invitedBy: JoinedByMember | null;
};

type DirectoryMember = {
  auth_user_id: string;
  display_name: string | null;
  self_person_id: string | null;
  invited_by_user_id: string | null;
  invited_by_name: string | null;
};

/**
 * Each entry's added-by and invited-by, by entry id. An entry is a member's
 * through their own entry or an approved claim (as `accountTypesByPerson`);
 * the invite is that member's on this tree (`tree_members`). Someone who
 * added their own entry isn't "added by" anyone: how they came is their
 * invite, or nothing for a founder. Nobody named is left out, and an entry
 * with neither isn't listed.
 */
export function joinedByPerson(
  people: readonly { id: string; created_by: string }[],
  members: readonly DirectoryMember[],
  approvedClaims: readonly { person_id: string; claimant_user_id: string }[],
  /** Names of creators who aren't on this tree's directory. */
  otherNames: ReadonlyMap<string, string> = new Map(),
): Map<string, JoinedBy> {
  const nameById = new Map(otherNames);
  const memberById = new Map<string, DirectoryMember>();
  for (const m of members) {
    memberById.set(m.auth_user_id, m);
    if (m.display_name) nameById.set(m.auth_user_id, m.display_name);
  }
  const memberByPerson = new Map<string, DirectoryMember>();
  for (const m of members) {
    if (m.self_person_id) memberByPerson.set(m.self_person_id, m);
  }
  for (const c of approvedClaims) {
    const m = memberById.get(c.claimant_user_id);
    if (m && !memberByPerson.has(c.person_id)) memberByPerson.set(c.person_id, m);
  }

  const named = (id: string | null, name?: string | null) => {
    const n = name ?? (id ? nameById.get(id) : undefined);
    return id && n ? { id, name: n } : null;
  };

  const out = new Map<string, JoinedBy>();
  for (const p of people) {
    const member = memberByPerson.get(p.id);
    const addedBy =
      p.created_by && p.created_by !== member?.auth_user_id
        ? named(p.created_by)
        : null;
    const invitedBy = member
      ? named(member.invited_by_user_id, member.invited_by_name)
      : null;
    if (addedBy || invitedBy) out.set(p.id, { addedBy, invitedBy });
  }
  return out;
}

export type JoinedByTag = { kind: "added" | "invited"; label: string };

/** The footer's tags, with the viewer as "you". */
export function joinedByTags(
  joined: JoinedBy | null,
  viewerId: string,
): JoinedByTag[] {
  if (!joined) return [];
  const { addedBy, invitedBy } = joined;
  const who = (m: JoinedByMember) => (m.id === viewerId ? "you" : m.name);
  if (addedBy && invitedBy && addedBy.id === invitedBy.id) {
    return [{ kind: "added", label: `Added and invited by ${who(addedBy)}` }];
  }
  return [
    ...(addedBy
      ? [{ kind: "added" as const, label: `Added by ${who(addedBy)}` }]
      : []),
    ...(invitedBy
      ? [{ kind: "invited" as const, label: `Invited by ${who(invitedBy)}` }]
      : []),
  ];
}
