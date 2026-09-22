import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeGuide } from "@/components/account-type-guide";
import { AccountTypePicker } from "@/components/account-type-picker";
import { AdminArchivedInvites } from "@/components/admin-archived-invites";
import { AdminBareInvites } from "@/components/admin-bare-invites";
import { AdminDisputedClaims } from "@/components/admin-disputed-claims";
import { AdminExport } from "@/components/admin-export";
import { AdminInviteHistory } from "@/components/admin-invite-history";
import { AdminNicknames } from "@/components/admin-nicknames";
import {
  AdminInviteRequests,
  type PendingInviteRequest,
} from "@/components/admin-invite-requests";
import { AdminGroup, AdminSubsection } from "@/components/admin/admin-group";
import { AdminNotifications } from "@/components/admin/admin-notifications";
import { AdminPlacements } from "@/components/admin/admin-placements";
import { AdminTreeRequests } from "@/components/admin/admin-tree-requests";
import {
  AdminSideNav,
  type AdminNavGroup,
} from "@/components/admin/admin-side-nav";
import {
  AdminTreeName,
  AdminTreeVisibility,
  type ViewerTreeOption,
} from "@/components/admin/admin-tree-settings";
import { AdminDeleteTree } from "@/components/admin/admin-delete-tree";
import { DeleteMemberButton } from "@/components/delete-member-button";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { InviteMinter } from "@/components/invite-minter";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  ShareLinkManager,
  type ShareLinkRow,
} from "@/components/share-link-manager";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { branchSideLabel, invitableTypes } from "@/lib/account-types";
import { getBranchSides } from "@/lib/branch.server";
import { buildAdminActionItems } from "@/lib/admin-notifications";
import { listDisputedClaims } from "@/lib/claims";
import {
  archiveExpiredInvites,
  listArchivedInvites,
  listBareInvites,
  listInviteHistory,
} from "@/lib/invites";
import { listNicknameGroups } from "@/lib/nicknames.server";
import {
  listForeignPlacements,
  listPlacementCandidates,
} from "@/lib/placements.server";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { listMyTrees, type TreeMembership } from "@/lib/tree-context";
import { isBetaReviewer, listTreeRequests } from "@/lib/tree-requests.server";

/**
 * The current tree's admin console — the "Admin" view of the account page: stats, members, people from other trees, requests, disputes,
 * invites, share links, the tree's name, who else may view it, export and
 * deletion. The account page hands it a Root's membership of that tree.
 */
export async function AdminConsole({
  membership,
}: {
  membership: TreeMembership;
}) {
  const { tree, profile: currentAdmin, role } = membership;

  const supabase = await createClient();
  const [
    membersRes,
    peopleRes,
    relCountRes,
    approvedClaimsRes,
    openFlagsRes,
    inviteRequestsRes,
    shareLinksRes,
    visibilityRes,
    myTrees,
  ] = await Promise.all([
    supabase
      .from("member_directory")
      .select("*")
      .eq("tree_id", tree.id)
      .order("joined_at", { ascending: true }),
    supabase
      .from("tree_people")
      .select("id, created_by, verified_at, is_home")
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
    supabase
      .from("entry_comments")
      .select("id", { count: "exact", head: true })
      .eq("tree_id", tree.id)
      .eq("is_flag", true)
      .eq("status", "open"),
    supabase
      .from("invite_requests")
      .select("id, first_name, last_name, email, created_at")
      .eq("tree_id", tree.id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("share_links")
      .select(
        "id, token, label, created_at, expires_at, revoked_at, last_viewed_at, view_count",
      )
      .eq("tree_id", tree.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("tree_visibility")
      .select("viewer_tree_id")
      .eq("tree_id", tree.id),
    listMyTrees(),
  ]);

  const members = (membersRes.data ?? []).filter(
    (m): m is typeof m & { auth_user_id: string } => !!m.auth_user_id,
  );
  // Whose side each Branch tends part of — the Root their own entry is related
  // to. They tend the part of it they are related through (Step 22.2).
  const selfEntryOf = new Map(
    members.map((m) => [m.auth_user_id, m.self_person_id]),
  );
  const branchSides = await getBranchSides(
    members.flatMap((m) =>
      m.role === "branch_admin"
        ? [m.self_person_id].filter((id): id is string => !!id)
        : [],
    ),
    tree.id,
  );
  const branchCaption = (userId: string | null): string => {
    const self = userId ? selfEntryOf.get(userId) : null;
    if (!self) return "Tends a side once they’re on the tree";
    const side = branchSideLabel(branchSides.get(self) ?? []);
    return side
      ? `Tends their part of ${side}`
      : "Related to no Root, so tends no side";
  };
  const people = peopleRes.data ?? [];
  const disputedClaims = await listDisputedClaims(tree.id);
  // Before listing, so a link that lapsed since the last visit lands in
  // "Archived invites" rather than lingering among the live ones.
  await archiveExpiredInvites(tree.id);
  const [
    inviteHistory,
    bareInvites,
    archivedInvites,
    candidates,
    foreign,
    reviewer,
  ] = await Promise.all([
    listInviteHistory(tree.id),
    listBareInvites(tree.id),
    listArchivedInvites(tree.id),
    listPlacementCandidates(tree.id),
    listForeignPlacements(tree.id),
    isBetaReviewer(),
  ]);
  // Requests to start a tree (Step 28) are the site's, not this tree's: the
  // same queue shows on every console a beta reviewer runs.
  const treeRequests = reviewer ? await listTreeRequests() : [];
  const openTreeRequests = treeRequests.filter(
    (r) => r.status === "pending",
  ).length;
  const nicknameGroups = await listNicknameGroups();
  const inviteRequests: PendingInviteRequest[] = (
    inviteRequestsRes.data ?? []
  ).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
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

  const openTo = new Set(
    (visibilityRes.data ?? []).map((v) => v.viewer_tree_id),
  );
  const viewers: ViewerTreeOption[] = myTrees
    .filter((t) => t.id !== tree.id)
    .map((t) => ({ id: t.id, name: t.name, visible: openTo.has(t.id) }));

  const entryCountByCreator = new Map<string, number>();
  let unverified = 0;
  let fromElsewhere = 0;
  for (const p of people) {
    if (p.created_by) {
      entryCountByCreator.set(
        p.created_by,
        (entryCountByCreator.get(p.created_by) ?? 0) + 1,
      );
    }
    if (!p.verified_at) unverified += 1;
    if (p.is_home === false) fromElsewhere += 1;
  }

  const pendingPlacements = foreign.filter(
    (f) => f.status === "pending",
  ).length;
  const actionItems = buildAdminActionItems({
    inviteRequests: inviteRequests.length,
    disputedClaims: disputedClaims.length,
    treeRequests: openTreeRequests,
  });
  const requestsBadge =
    inviteRequests.length + disputedClaims.length + openTreeRequests;

  const stats: { label: string; value: number }[] = [
    { label: "Members", value: members.length },
    { label: "Entries", value: people.length },
    { label: "From Other Trees", value: fromElsewhere },
    { label: "Connections", value: relCountRes.count ?? 0 },
    { label: "Claimed", value: approvedClaimsRes.count ?? 0 },
    { label: "Unverified", value: unverified },
    { label: "Open flags", value: openFlagsRes.count ?? 0 },
    { label: "Disputes", value: disputedClaims.length },
    { label: "Invite requests", value: inviteRequests.length },
  ];

  const navGroups: AdminNavGroup[] = [
    {
      label: null,
      items: [
        { id: "overview", label: "Overview" },
        { id: "members", label: "Members" },
        { id: "account-types", label: "Account Types" },
      ],
    },
    {
      label: "People",
      items: [{ id: "placements", label: "From Other Trees" }],
    },
    {
      label: "Requests & claims",
      items: [
        { id: "invite-requests", label: "Requests for Access" },
        { id: "disputes", label: "Disputed Claims" },
        ...(reviewer
          ? [{ id: "tree-requests", label: "Requests to Start a Tree" }]
          : []),
      ],
    },
    {
      label: "Invites",
      items: [
        { id: "invite", label: "Invite a Relative" },
        { id: "found", label: "Invite Someone to Start a Tree" },
        { id: "share", label: "Share a Link" },
        { id: "sent-invites", label: "Sent Invites" },
        { id: "bare-invites", label: "Bare Links" },
        { id: "archived-invites", label: "Archived" },
      ],
    },
    {
      label: "Settings",
      items: [
        { id: "tree-name", label: "Tree Name" },
        { id: "visibility", label: "Who Else Can View" },
        { id: "data-privacy", label: "Data & Privacy" },
        { id: "nicknames", label: "Nicknames" },
        { id: "view", label: "View" },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <AdminSideNav groups={navGroups} />

      <div>
        <h2 className="text-xl font-semibold tracking-tight">{tree.name}</h2>
        <p className="text-sm text-muted-foreground">
          Members, invites, disputes, who this tree shows, and its health at a
          glance.
        </p>
      </div>

      <AdminNotifications items={actionItems} />

      <Card id="overview" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Counts across this tree.</CardDescription>
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
        description={`${members.length} member${members.length === 1 ? "" : "s"} — their account type on this tree, who invited them, entries created, and invite permissions.`}
        sectionIds={["members", "account-types"]}
      >
        <AdminSubsection id="members" title="Who’s on the Tree">
          <div className="-mx-(--card-spacing) overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members, their account type, who invited them, entries created,
                and invite permissions
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
                    Invites as
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
                            name={member.display_name ?? "This member"}
                          />
                          {member.role === "branch_admin" ? (
                            <span className="text-xs text-muted-foreground">
                              {branchCaption(member.auth_user_id)}
                            </span>
                          ) : null}
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
                    <td className="px-4 py-3 text-muted-foreground">
                      {invitableTypes(member.role)
                        .map((t) => t.name)
                        .join(" or ") || "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {member.role !== "admin" &&
                      member.auth_user_id !== currentAdmin.auth_user_id ? (
                        <DeleteMemberButton
                          treeId={tree.id}
                          userId={member.auth_user_id}
                          name={member.display_name ?? "this member"}
                          entryCount={
                            entryCountByCreator.get(member.auth_user_id) ?? 0
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
          description="What each kind of member can reach on this tree. Anyone who isn’t a Root can be switched between Branch, Canopy and Leaf from the table above, or made a Root — which is for good: a Root is never demoted or removed. New members join as Canopy. A member’s type on another tree is that tree’s business. A Branch tends the part of a Root’s side they’re related through — a Root’s father’s family, say, not their mother’s — and a child of two Roots tends their part of both."
        >
          <AccountTypeGuide />
        </AdminSubsection>
      </AdminGroup>

      <AdminGroup
        title="People from Other Trees"
        description="Everyone has one entry. Bring people you can see on your other trees onto this one; their details stay theirs to keep, and each tree arranges them on its own canvas."
        sectionIds={["placements"]}
        badge={pendingPlacements}
        defaultOpen={fromElsewhere === 0 && candidates.length > 0}
      >
        <AdminSubsection
          id="placements"
          title="Who This Tree Shows"
          description={`${fromElsewhere} ${fromElsewhere === 1 ? "person" : "people"} on this tree call another tree home. Their details, photo and connections follow their home tree’s rules; what you decide here is whether they appear, and where the card sits. A member’s own entry only appears once they’ve said yes.`}
        >
          <AdminPlacements
            treeId={tree.id}
            candidates={candidates}
            placed={foreign}
          />
        </AdminSubsection>
      </AdminGroup>

      <AdminGroup
        title="Requests & Claims"
        description={
          reviewer
            ? "People asking to join, contesting a claim, or asking to start a tree."
            : "People asking to join, or contesting a claim."
        }
        sectionIds={[
          "invite-requests",
          "disputes",
          ...(reviewer ? ["tree-requests"] : []),
        ]}
        badge={requestsBadge}
        defaultOpen={requestsBadge > 0}
      >
        <AdminSubsection
          id="invite-requests"
          collapsible
          defaultOpen={inviteRequests.length > 0}
          title="Requests for Access"
          description={`${inviteRequests.length} awaiting review. Approving mints a single-use link and emails it to the person who asked — if the email fails to send, you can still copy the link yourself. Declining keeps a record; deleting leaves none and lets them ask again.`}
        >
          <AdminInviteRequests requests={inviteRequests} />
        </AdminSubsection>

        <AdminSubsection
          id="disputes"
          collapsible
          defaultOpen={disputedClaims.length > 0}
          title="Disputed Claims"
          description={`${disputedClaims.length} awaiting a decision. Upholding keeps the new owner; reversing returns the entry to its creator.`}
        >
          <AdminDisputedClaims claims={disputedClaims} />
        </AdminSubsection>

        {reviewer ? (
          <AdminSubsection
            id="tree-requests"
            collapsible
            defaultOpen={openTreeRequests > 0}
            title="Requests to Start a Tree"
            description={`${openTreeRequests} awaiting you, from every tree and the waitlist on the home page. New trees are by request during the beta, and only beta reviewers see this. Approving a member lets them start one and emails them. Approving someone from the waitlist emails them a founder invite from ${tree.name}, which you can resend from Sent Invites. Declining keeps a record; deleting leaves none and lets them ask again.`}
          >
            <AdminTreeRequests treeId={tree.id} requests={treeRequests} />
          </AdminSubsection>
        ) : null}
      </AdminGroup>

      <AdminGroup
        title="Invites"
        description="Bring relatives in, start someone on a tree of their own, and share this tree read-only."
        sectionIds={[
          "invite",
          "found",
          "share",
          "sent-invites",
          "bare-invites",
          "archived-invites",
        ]}
      >
        <AdminSubsection
          id="invite"
          title="Invite a Relative"
          description="Each link is tied to you, works once, and expires after 14 days. Send by name and email and it’s emailed for you — that link signs them straight in, nothing to set up. Or mint a bare link to send yourself; it asks for their email first. Either way, choose whether they join as Canopy or as a Leaf; Branches and Canopy members invite Leaves from their account page. Someone who already has an account on another tree joins this one with the same link."
        >
          <div className="flex flex-col gap-6">
            <DirectInviteForm treeId={tree.id} />
            <div className="border-t border-border pt-6">
              <InviteMinter
                treeId={tree.id}
                options={invitableTypes(role).map((t) => t.key)}
              />
            </div>
          </div>
        </AdminSubsection>

        <AdminSubsection
          id="found"
          collapsible
          title="Invite Someone to Start a Tree of Their Own"
          description="For a family that isn’t yours: the link signs them in and plants a brand-new, empty tree with them as its first Root. Nothing from this tree goes with it. One founded tree per person; a member who already has one can still be a Root elsewhere."
        >
          <DirectInviteForm treeId={tree.id} founder />
        </AdminSubsection>

        <AdminSubsection
          id="share"
          collapsible
          title="Share a View-Only Link"
          description="Anyone with a share link can view this tree without signing in, but can’t edit anything. They’ll see a prompt to request access. Revoke a link any time to cut off access."
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
          description={`Invites still waiting on someone, however they started — the last ${inviteHistory.length}. An invite disappears once they join, and moves to Archived if it expires first. Deleting one also kills its link.`}
        >
          <AdminInviteHistory items={inviteHistory} />
        </AdminSubsection>

        <AdminSubsection
          id="bare-invites"
          collapsible
          title="Bare Invite Links"
          description="Links minted without a name attached, so they never show up under “Sent invites”. Copy one to send it on, or delete it to stop it working — including wherever you’ve already sent it."
        >
          <AdminBareInvites invites={bareInvites} baseUrl={getSiteUrl()} />
        </AdminSubsection>

        <AdminSubsection
          id="archived-invites"
          collapsible
          title="Archived Invites"
          description="Invites that expired before anyone used them. They can’t be used; they’re kept only as a record. To try again, send a fresh invite."
        >
          <AdminArchivedInvites invites={archivedInvites} />
        </AdminSubsection>
      </AdminGroup>

      <AdminGroup
        title="Settings"
        description="The tree’s name, who else may view it, data exports, nickname matching, and appearance."
        sectionIds={[
          "tree-name",
          "visibility",
          "data-privacy",
          "nicknames",
          "view",
        ]}
      >
        <AdminSubsection
          id="tree-name"
          title="Tree Name"
          description="Shown in the header and the tree switcher. The web address follows it, so links you’ve shared before change with it."
        >
          <AdminTreeName treeId={tree.id} name={tree.name} />
        </AdminSubsection>

        <AdminSubsection
          id="visibility"
          collapsible
          title="Who Else Can View This Tree"
          description="Open this tree, read-only, to the members of another tree you belong to. They reach it from the card of someone shown on both, and can ask to join. Anyone can mark their own entry hidden from visitors; it then appears blurred to them."
        >
          <AdminTreeVisibility treeId={tree.id} viewers={viewers} />
        </AdminSubsection>

        <AdminSubsection
          id="data-privacy"
          title="Data & Privacy"
          description="Export this tree as JSON for a data-access request. To erase a specific person and their photos and documents, open their entry on the tree and use “Delete entry”. Deleting the whole tree moves everyone whose home it is to another tree that shows them, and removes the rest."
        >
          <div className="flex flex-wrap items-center gap-3">
            <AdminExport treeId={tree.id} />
            <AdminDeleteTree treeId={tree.id} name={tree.name} />
          </div>
        </AdminSubsection>

        <AdminSubsection
          id="nicknames"
          collapsible
          title="Nicknames"
          description={`${nicknameGroups.length} groups behind the “is one of these you?” search a new member sees when they join. Spelling mistakes and accents are handled automatically — this is for names that share neither spelling nor sound with the root, like Bob for Robert. The seed is English, so add the ones this family uses. Shared by every tree.`}
        >
          <AdminNicknames groups={nicknameGroups} />
        </AdminSubsection>

        <AdminSubsection
          id="view"
          title="View"
          description="Light, dark, or follow your device. Saved to this browser."
        >
          <ThemeToggle />
        </AdminSubsection>
      </AdminGroup>
    </div>
  );
}
