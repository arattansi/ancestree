import type { Metadata } from "next";

import { setCanInvite } from "@/app/actions/invites";
import { AdminBareInvites } from "@/components/admin-bare-invites";
import { AdminCanvasInterest } from "@/components/admin-canvas-interest";
import { AdminDisputedClaims } from "@/components/admin-disputed-claims";
import { AdminExport } from "@/components/admin-export";
import { AdminInviteHistory } from "@/components/admin-invite-history";
import { AdminNicknames } from "@/components/admin-nicknames";
import {
  AdminInviteRequests,
  type PendingInviteRequest,
} from "@/components/admin-invite-requests";
import { AdminSideNav, type AdminNavItem } from "@/components/admin/admin-side-nav";
import { CollapsibleSection } from "@/components/admin/collapsible-section";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { InviteMinter } from "@/components/invite-minter";
import { ShareLinkManager, type ShareLinkRow } from "@/components/share-link-manager";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { listDisputedClaims } from "@/lib/claims";
import { listCanvasInterest } from "@/lib/growth-rights.server";
import { multiTreeEnabled } from "@/lib/flags";
import { listBareInvites, listInviteHistory } from "@/lib/invites";
import { listNicknameGroups } from "@/lib/nicknames.server";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin",
  description: "Manage members, invites, disputes, and entry counts.",
};

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createClient();
  const [
    membersRes,
    peopleRes,
    relCountRes,
    approvedClaimsRes,
    openFlagsRes,
    bridgesRes,
    inviteRequestsRes,
    shareLinksRes,
  ] = await Promise.all([
    supabase
      .from("member_directory")
      .select("*")
      .order("created_at", { ascending: true }),
    supabase.from("people").select("id, created_by, verified_at"),
    supabase
      .from("relationships")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("claims")
      .select("id", { count: "exact", head: true })
      .eq("status", "approved"),
    supabase
      .from("entry_comments")
      .select("id", { count: "exact", head: true })
      .eq("is_flag", true)
      .eq("status", "open"),
    multiTreeEnabled
      ? supabase.from("tree_bridges").select("id", { count: "exact", head: true })
      : Promise.resolve({ count: 0 }),
    supabase
      .from("invite_requests")
      .select("id, first_name, last_name, email, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    supabase
      .from("share_links")
      .select(
        "id, token, label, created_at, expires_at, revoked_at, last_viewed_at, view_count",
      )
      .order("created_at", { ascending: false }),
  ]);

  const members = membersRes.data ?? [];
  const people = peopleRes.data ?? [];
  const disputedClaims = await listDisputedClaims();
  const inviteHistory = await listInviteHistory();
  const bareInvites = await listBareInvites();
  const canvasInterest = await listCanvasInterest(supabase);
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

  const entryCountByCreator = new Map<string, number>();
  let unverified = 0;
  for (const p of people) {
    entryCountByCreator.set(
      p.created_by,
      (entryCountByCreator.get(p.created_by) ?? 0) + 1,
    );
    if (!p.verified_at) unverified += 1;
  }

  const stats: { label: string; value: number }[] = [
    { label: "Members", value: members.length },
    { label: "Entries", value: people.length },
    { label: "Relationships", value: relCountRes.count ?? 0 },
    { label: "Claimed", value: approvedClaimsRes.count ?? 0 },
    { label: "Unverified", value: unverified },
    { label: "Open flags", value: openFlagsRes.count ?? 0 },
    { label: "Disputes", value: disputedClaims.length },
    { label: "Invite requests", value: inviteRequests.length },
    { label: "Want own tree", value: canvasInterest.length },
  ];
  if (multiTreeEnabled) {
    stats.push({ label: "Own-tree bridges", value: bridgesRes.count ?? 0 });
  }

  const navItems: AdminNavItem[] = [
    { id: "overview", label: "Overview" },
    { id: "data-privacy", label: "Data & privacy" },
    { id: "invite", label: "Invite a relative" },
    { id: "share", label: "Share a link" },
    { id: "invite-requests", label: "Invite requests" },
    { id: "own-tree", label: "Wants own tree" },
    { id: "sent-invites", label: "Sent invites" },
    { id: "bare-invites", label: "Bare links" },
    { id: "nicknames", label: "Nicknames" },
    { id: "disputes", label: "Disputed claims" },
    { id: "members", label: "Members" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-4 px-4 py-10">
      <AdminSideNav items={navItems} />

      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Members, invite permissions, disputes, and tree health at a glance.
        </p>
      </div>

      <Card id="overview" className="scroll-mt-6">
        <CardHeader>
          <CardTitle>Overview</CardTitle>
          <CardDescription>Counts across the shared tree.</CardDescription>
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

      <CollapsibleSection
        id="data-privacy"
        title="Data & privacy"
        description="Export the whole tree as JSON for a data-access request. To erase a specific person and their photos and documents, open their entry on the tree and use “Delete entry”."
      >
        <AdminExport />
      </CollapsibleSection>

      <CollapsibleSection
        id="invite"
        title="Invite a relative"
        description="Each link is tied to you, works once, and expires after 14 days. Send by name and email and it’s emailed for you, or just mint a bare link to send yourself."
      >
        <div className="flex flex-col gap-6">
          <DirectInviteForm />
          <div className="border-t border-border pt-6">
            <InviteMinter />
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        id="share"
        title="Share a view-only link"
        description="Anyone with a share link can view the whole tree without signing in, but can’t edit anything. They’ll see a prompt to request edit access. Revoke a link any time to cut off access."
      >
        <ShareLinkManager links={shareLinks} baseUrl={getSiteUrl()} />
      </CollapsibleSection>

      <CollapsibleSection
        id="invite-requests"
        title="Invite requests"
        description={`${inviteRequests.length} awaiting review. Approving mints a single-use link and emails it to the person who asked — if the email fails to send, you can still copy the link yourself. Declining keeps a record; deleting leaves none and lets them ask again.`}
      >
        <AdminInviteRequests requests={inviteRequests} />
      </CollapsibleSection>

      <CollapsibleSection
        id="own-tree"
        title="Wants their own tree"
        description={`${canvasInterest.length} on the register. These are members who married into the family, tried to add their own side of it, and said they’d want a tree of their own. Nothing is granted — it’s a record of who to reach out to if this goes to market, and the clearest read we have on whether there’s demand.`}
      >
        <AdminCanvasInterest rows={canvasInterest} />
      </CollapsibleSection>

      <CollapsibleSection
        id="sent-invites"
        title="Sent invites"
        description={`Every invite that has gone out, however it started — the last ${inviteHistory.length}. Deleting one also kills its link, so an invite nobody has used yet stops working.`}
      >
        <AdminInviteHistory items={inviteHistory} />
      </CollapsibleSection>

      <CollapsibleSection
        id="bare-invites"
        title="Bare invite links"
        description="Links minted without a name attached, so they never show up under “Sent invites”. Copy one to send it on, or delete it to stop it working — including wherever you’ve already sent it."
      >
        <AdminBareInvites invites={bareInvites} baseUrl={getSiteUrl()} />
      </CollapsibleSection>

      <CollapsibleSection
        id="nicknames"
        title="Nicknames"
        description={`${nicknameGroups.length} groups behind the “is one of these you?” search a new member sees when they join. Spelling mistakes and accents are handled automatically — this is for names that share neither spelling nor sound with the root, like Bob for Robert. The seed is English, so add the ones this family uses.`}
      >
        <AdminNicknames groups={nicknameGroups} />
      </CollapsibleSection>

      <CollapsibleSection
        id="disputes"
        title="Disputed claims"
        description={`${disputedClaims.length} awaiting a decision. Upholding keeps the new owner; reversing returns the entry to its creator.`}
      >
        <AdminDisputedClaims claims={disputedClaims} />
      </CollapsibleSection>

      <CollapsibleSection
        id="members"
        title="Members"
        description={`${members.length} member${members.length === 1 ? "" : "s"}`}
        contentClassName="p-0"
      >
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members, their role, who invited them, entries created, and
                invite permissions
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Member</th>
                  <th scope="col" className="px-4 py-2 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2 font-medium">Invited by</th>
                  <th scope="col" className="px-4 py-2 font-medium">Entries</th>
                  <th scope="col" className="px-4 py-2 font-medium">Can invite</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.auth_user_id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {member.display_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={member.role === "admin" ? "default" : "secondary"}>
                        {member.role}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {member.invited_by_name ?? (member.role === "admin" ? "—" : "Unknown")}
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {member.auth_user_id
                        ? entryCountByCreator.get(member.auth_user_id) ?? 0
                        : 0}
                    </td>
                    <td className="px-4 py-3">
                      {member.role === "admin" ? (
                        <span className="text-muted-foreground">Always</span>
                      ) : (
                        <form action={setCanInvite}>
                          <input type="hidden" name="userId" value={member.auth_user_id ?? ""} />
                          <input
                            type="hidden"
                            name="canInvite"
                            value={(!member.can_invite).toString()}
                          />
                          <Button type="submit" variant="outline" size="sm">
                            {member.can_invite ? "Revoke" : "Grant"}
                          </Button>
                        </form>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
      </CollapsibleSection>
    </main>
  );
}
