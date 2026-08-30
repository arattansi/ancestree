import type { Metadata } from "next";

import { setCanInvite } from "@/app/actions/invites";
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
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin",
  description: "Manage members and invite permissions.",
};

export default async function AdminPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data: members } = await supabase
    .from("member_directory")
    .select("*")
    .order("created_at", { ascending: true });

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <p className="text-sm text-muted-foreground">
          Manage who can invite new relatives.
        </p>
      </div>

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
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {members?.length ?? 0} member{members?.length === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">
                Members, their role, who invited them, and invite permissions
              </caption>
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th scope="col" className="px-4 py-2 font-medium">Member</th>
                  <th scope="col" className="px-4 py-2 font-medium">Role</th>
                  <th scope="col" className="px-4 py-2 font-medium">Invited by</th>
                  <th scope="col" className="px-4 py-2 font-medium">Can invite</th>
                </tr>
              </thead>
              <tbody>
                {members?.map((member) => (
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
