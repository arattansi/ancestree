import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeGuide } from "@/components/account-type-guide";
import { AccountTypePicker } from "@/components/admin/account-type-picker";
import { AdminArchivedInvites } from "@/components/admin/admin-archived-invites";
import { AdminReports } from "@/components/admin/admin-reports";
import { AdminInviteHistory } from "@/components/admin/admin-invite-history";
import {
  AdminInviteRequests,
  type PendingInviteRequest,
} from "@/components/admin/admin-invite-requests";
import { AdminGroup, AdminSubsection } from "@/components/admin/admin-group";
import { AdminNotifications } from "@/components/admin/admin-notifications";
import { AdminPlacements } from "@/components/admin/admin-placements";
import { AdminSideNav } from "@/components/admin/admin-side-nav";
import { AdminFamilyLink } from "@/components/admin/admin-family-link";
import { DeleteMemberButton } from "@/components/admin/delete-member-button";
import { DirectInviteForm } from "@/components/direct-invite-form";
import {
  ShareLinkManager,
  type ShareLinkRow,
} from "@/components/admin/share-link-manager";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  BRANCH,
  ROOT,
  accountTypeOf,
  branchSideLabel,
  unavailableTypes,
  type TreeRoom,
} from "@/lib/account-types";
import { branchSidesOn } from "@/lib/branch.server";
import { buildAdminActionItems } from "@/lib/admin-notifications";
import { adminNav, groupSectionIds } from "@/lib/admin-sections";
import { listTreeReports } from "@/lib/entry-reports";
import { getFamilyLink, listFamilyLinkJoins } from "@/lib/family-link.server";
import {
  archiveExpiredInvites,
  listArchivedInvites,
  listInviteHistory,
} from "@/lib/invites";
import { membersOnOtherTrees } from "@/lib/remove-member.server";
import { listRequestCandidates } from "@/lib/request-candidates.server";
import { listCarried, listCarryChoices } from "@/lib/placements.server";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import type { TreeMembership } from "@/lib/tree-context";

/**
 * The current tree's Root console — the "root" view of the account page:
 * stats, members, people from other trees, requests, reports, invites and
 * share links. The tree's own settings live in the settings view (Step
 * 103.2). The account page hands it a Root's membership of that tree.
 */
export async function AdminConsole({
  membership,
}: {
  membership: TreeMembership;
}) {
  const { tree, profile: currentAdmin } = membership;

  // Every read starts at once, and one that needs another's answer starts
  // the moment it has it (Step 77.1): the console waits for its longest
  // chain, not for eight stages in a row.
  const supabase = await createClient();
  const membersP = supabase
    .from("member_directory")
    .select("*")
    .eq("tree_id", tree.id)
    .order("joined_at", { ascending: true })
    .then((res) =>
      (res.data ?? []).filter(
        (m): m is typeof m & { auth_user_id: string } => !!m.auth_user_id,
      ),
    );
  const pendingRequestsP = supabase
    .from("invite_requests")
    .select("id, first_name, last_name, email, created_at")
    .eq("tree_id", tree.id)
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .then((res) => res.data ?? []);
  const familyLinkP = getFamilyLink(tree.id);
  // Who you can remove: anyone who isn't a Root, so never yourself.
  const removable = (m: { role: string | null; auth_user_id: string }) =>
    m.role !== ROOT.key && m.auth_user_id !== currentAdmin.auth_user_id;

  const [
    members,
    peopleRes,
    relCountRes,
    approvedClaimsRes,
    pendingRequests,
    shareLinksRes,
    sideOf,
    reports,
    [inviteHistory, archivedInvites],
    familyLink,
    familyLinkJoins,
    carry,
    carried,
    requestCandidates,
    onOtherTrees,
  ] = await Promise.all([
    membersP,
    supabase
      .from("tree_people")
      .select("id, created_by, is_home")
      .eq("tree_id", tree.id),
    supabase
      .from("tree_edges")
      .select("id", { count: "exact", head: true })
      .eq("tree_id", tree.id),
    supabase
      .from("claims")
      .select("id, people!inner(tree_id)", { count: "exact", head: true })
      .eq("status", "approved")
      .eq("people.tree_id", tree.id),
    pendingRequestsP,
    supabase
      .from("share_links")
      .select(
        "id, token, label, created_at, expires_at, revoked_at, last_viewed_at, view_count",
      )
      .eq("tree_id", tree.id)
      .order("created_at", { ascending: false }),
    // Whose side each Branch tends part of — the Root their own entry is
    // related to. They tend the part of it they are related through (Step
    // 22.2).
    branchSidesOn(tree.id),
    listTreeReports(tree.id, currentAdmin.auth_user_id),
    // Archived before listing, so a link that lapsed since the last visit
    // lands in "Archived invites" rather than lingering among the live ones.
    archiveExpiredInvites(tree.id).then(() =>
      Promise.all([
        listInviteHistory(tree.id),
        listArchivedInvites(tree.id),
      ]),
    ),
    familyLinkP,
    // Who joined with the family link, this one or an earlier one (Step 52).
    familyLinkP.then((link) => listFamilyLinkJoins(tree.id, link?.id ?? null)),
    listCarryChoices(tree.id),
    listCarried(tree.id),
    // Who on the tree each requester's name matches (Step 30.3).
    pendingRequestsP.then((requests) =>
      listRequestCandidates(requests.map((r) => r.id)),
    ),
    // Whether removing each one deletes their login too (Step 46).
    membersP.then((members) =>
      membersOnOtherTrees(
        tree.id,
        members.filter(removable).map((m) => m.auth_user_id),
      ),
    ),
  ]);

  const selfEntryOf = new Map(
    members.map((m) => [m.auth_user_id, m.self_person_id]),
  );
  const branchCaption = (userId: string | null): string => {
    const self = userId ? selfEntryOf.get(userId) : null;
    if (!self) return "Tends a side once they’re on the tree";
    const side = branchSideLabel(sideOf(self));
    return side
      ? `Tends their part of ${side}`
      : "Related to no Root, so tends no side";
  };
  // Where the tree stands against the limits (Step 39): its Roots, and the
  // Branches each Root has made, counted against whoever made them one.
  const roots = members.filter((m) => m.role === ROOT.key);
  const branchesMadeBy = new Map<string, number>();
  for (const m of members) {
    if (m.role !== BRANCH.key || !m.branch_granted_by) continue;
    branchesMadeBy.set(
      m.branch_granted_by,
      (branchesMadeBy.get(m.branch_granted_by) ?? 0) + 1,
    );
  }
  const room: TreeRoom = {
    roots: roots.length,
    branchesMade: branchesMadeBy.get(currentAdmin.auth_user_id) ?? 0,
  };
  const madeBranchBy = (
    grantedBy: string | null,
    grantedByName: string | null,
  ): string | null =>
    !grantedBy
      ? null
      : grantedBy === currentAdmin.auth_user_id
        ? "Made a Branch by you"
        : `Made a Branch by ${grantedByName ?? "another Root"}`;
  const people = peopleRes.data ?? [];
  const inviteRequests: PendingInviteRequest[] = pendingRequests.map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
    candidates: requestCandidates.get(r.id) ?? [],
  }));

  const shareLinks: ShareLinkRow[] = (shareLinksRes.data ?? []).map((l) => ({
    id: l.id,
    token: l.token,
    label: l.label,
    createdAt: l.created_at,
    expiresAt: l.expires_at,
    revokedAt: l.revoked_at,
    lastViewedAt: l.last_viewed_at,
    viewCount: l.view_count,
  }));

  const entryCountByCreator = new Map<string, number>();
  let fromElsewhere = 0;
  for (const p of people) {
    if (p.created_by) {
      entryCountByCreator.set(
        p.created_by,
        (entryCountByCreator.get(p.created_by) ?? 0) + 1,
      );
    }
    if (p.is_home === false) fromElsewhere += 1;
  }

  // Cards still waiting on someone's yes (Step 80).
  const pendingPlacements = carried.filter(
    (c) => c.approval === "asked",
  ).length;
  const actionItems = buildAdminActionItems({
    inviteRequests: inviteRequests.length,
    reports: reports.length,
  });
  const requestsBadge = inviteRequests.length + reports.length;

  const stats: { label: string; value: number }[] = [
    { label: "Members", value: members.length },
    { label: "Entries", value: people.length },
    { label: "From Other Trees", value: fromElsewhere },
    { label: "Connections", value: relCountRes.count ?? 0 },
    { label: "Claimed", value: approvedClaimsRes.count ?? 0 },
    { label: "Reports", value: reports.length },
    { label: "Invite requests", value: inviteRequests.length },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminSideNav groups={adminNav()} />

      <h2 className="text-xl font-semibold tracking-tight">{tree.name}</h2>

      <AdminNotifications items={actionItems} />

      <Card id="overview" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {stats.map((s) => (
              <div
                key={s.label}
                className="rounded-lg border border-border p-3"
              >
                <dt className="text-xs font-medium text-muted-foreground">
                  {s.label}
                </dt>
                <dd className="text-2xl font-semibold tabular-nums">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <AdminGroup
        title="Members"
        sectionIds={groupSectionIds("members")}
      >
        <AdminSubsection
          id="members"
          title="Who’s on the Tree"
        >
          <div className="-mx-(--card-spacing) overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members, their account type, who invited them, and entries
                created
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">
                    Member
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Account
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Invited by
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Entries
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    <span className="sr-only">Remove</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr
                    key={member.auth_user_id}
                    className="border-b border-border last:border-0"
                  >
                    <td className="px-4 py-3 font-medium text-foreground">
                      {member.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {member.role !== "admin" ? (
                        <div className="flex flex-col items-start gap-1">
                          <AccountTypePicker
                            treeId={tree.id}
                            userId={member.auth_user_id}
                            role={member.role ?? "member"}
                            name={member.display_name ?? "this member"}
                            roots={room.roots}
                            unavailable={unavailableTypes(
                              accountTypeOf(member.role).key,
                              room,
                            )}
                          />
                          {member.role === "branch_admin"
                            ? [
                                branchCaption(member.auth_user_id),
                                madeBranchBy(
                                  member.branch_granted_by,
                                  member.branch_granted_by_name,
                                ),
                              ]
                                .filter((line): line is string => !!line)
                                .map((line) => (
                                  <span
                                    key={line}
                                    className="text-xs text-muted-foreground"
                                  >
                                    {line}
                                  </span>
                                ))
                            : null}
                        </div>
                      ) : (
                        <AccountTypeBadge role={member.role} />
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.invited_by_name ??
                        (member.role === "admin" ? "—" : "Unknown")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {entryCountByCreator.get(member.auth_user_id) ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {removable(member) ? (
                        <DeleteMemberButton
                          treeId={tree.id}
                          treeName={tree.name}
                          userId={member.auth_user_id}
                          name={member.display_name ?? "this member"}
                          entryCount={
                            entryCountByCreator.get(member.auth_user_id) ?? 0
                          }
                          onlyTree={
                            onOtherTrees
                              ? !onOtherTrees.has(member.auth_user_id)
                              : null
                          }
                        />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminSubsection>

        <AdminSubsection
          id="account-types"
          collapsible
          title="Account Types"
        >
          <AccountTypeGuide brief />
        </AdminSubsection>
      </AdminGroup>

      <AdminGroup
        title="People from Other Trees"
        sectionIds={groupSectionIds("people")}
        badge={pendingPlacements}
        defaultOpen={fromElsewhere === 0 && carry.people.some((p) => !p.here)}
      >
        <AdminSubsection
          id="placements"
          title="Who This Tree Shows"
        >
          <AdminPlacements
            treeId={tree.id}
            people={carry.people}
            lines={carry.lines}
            carried={carried}
          />
        </AdminSubsection>
      </AdminGroup>

      <AdminGroup
        title="Requests & Reports"
        sectionIds={groupSectionIds("requests")}
        badge={requestsBadge}
        defaultOpen={requestsBadge > 0}
      >
        <AdminSubsection
          id="invite-requests"
          collapsible
          defaultOpen={inviteRequests.length > 0}
          title="Requests for Access"
        >
          <AdminInviteRequests requests={inviteRequests} />
        </AdminSubsection>

        <AdminSubsection
          id="reports"
          collapsible
          defaultOpen={reports.length > 0}
          title="Reports"
        >
          <AdminReports reports={reports} />
        </AdminSubsection>

      </AdminGroup>

      <AdminGroup
        title="Invites"
        sectionIds={groupSectionIds("invites")}
      >
        <AdminSubsection
          id="invite"
          title="Invite a Relative"
        >
          <DirectInviteForm treeId={tree.id} />
        </AdminSubsection>

        <AdminSubsection
          id="family-link"
          title="Family Link"
        >
          <AdminFamilyLink
            treeId={tree.id}
            treeName={tree.name}
            link={familyLink}
            joins={familyLinkJoins}
            baseUrl={getSiteUrl()}
          />
        </AdminSubsection>

        <AdminSubsection
          id="share"
          collapsible
          title="Share a View-Only Link"
        >
          <ShareLinkManager
            treeId={tree.id}
            links={shareLinks}
            baseUrl={getSiteUrl()}
          />
        </AdminSubsection>

        <AdminSubsection
          id="sent-invites"
          collapsible
          title="Sent Invites"
        >
          <AdminInviteHistory items={inviteHistory} />
        </AdminSubsection>

        <AdminSubsection
          id="archived-invites"
          collapsible
          title="Archived Invites"
        >
          <AdminArchivedInvites invites={archivedInvites} />
        </AdminSubsection>
      </AdminGroup>
    </div>
  );
}
