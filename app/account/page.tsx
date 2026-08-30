import type { Metadata } from "next";

import { signOut } from "@/app/actions/auth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUser, requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your account" };

export default async function AccountPage() {
  const profile = await requireProfile();
  const user = await getUser();

  const supabase = await createClient();
  const { data: directory } = await supabase
    .from("member_directory")
    .select("invited_by_name")
    .eq("auth_user_id", profile.auth_user_id)
    .maybeSingle();

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>

      <Card>
        <CardHeader>
          <CardTitle>{profile.display_name ?? "Member"}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Email">{user?.email ?? "—"}</Row>
          <Row label="Role">
            <Badge variant={profile.role === "admin" ? "default" : "secondary"}>
              {profile.role}
            </Badge>
          </Row>
          <Row label="Invited by">
            {directory?.invited_by_name ??
              (profile.role === "admin" ? "Founding admin" : "Unknown")}
          </Row>
          <Row label="Invite rights">
            {profile.role === "admin" || profile.can_invite ? "Yes" : "No"}
          </Row>
        </CardContent>
      </Card>

      <form action={signOut}>
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}
