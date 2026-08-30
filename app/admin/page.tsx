import type { Metadata } from "next";

import { setCanInvite } from "@/app/actions/invites";
import { AdminDisputedClaims } from "@/components/admin-disputed-claims";
import { InviteMinter } from "@/components/invite-minter";
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
import { multiTreeEnabled } from "@/lib/flags";
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
  ]);

  const members = membersRes.data ?? [];
  const people = peopleRes.data ?? [];
  const disputedClaims = await listDisputedClaims();

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
  ];
  if (multiTreeEnabled) {
    stats.push({ label: "Own-tree bridges", value: bridgesRes.count ?? 0 });
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Members, invite permissions, disputes, and tree health at a glance.
        </p>
      </div>

      <Card>
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

      <Card>
        <CardHeader>
          <CardTitle>Invite a relative</CardTitle>
          <CardDescription>
            Each link is tied to you, works once, and expires after 14 days.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteMinter />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Disputed claims</CardTitle>
          <CardDescription>
            {disputedClaims.length} awaiting a decision. Upholding keeps the new
            owner; reversing returns the entry to its creator.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminDisputedClaims claims={disputedClaims} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members.length} member{members.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
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
        </CardContent>
      </Card>
    </main>
  );
}
