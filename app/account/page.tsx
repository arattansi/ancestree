import type { Metadata } from "next";

import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { DeleteAccount } from "@/components/delete-account";
import { NotificationsList } from "@/components/notifications-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getUser, requireProfile } from "@/lib/auth";
import { listNotifications } from "@/lib/claims";
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

  const notifications = user ? await listNotifications(user.id) : [];

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

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
        </CardHeader>
        <CardContent>
          <NotificationsList items={notifications} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy &amp; your data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Read how your family&rsquo;s data is stored and protected in the{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy notice
            </Link>
            . For a full JSON copy of the tree, or to remove a specific entry,
            ask an admin.
          </p>
          <div>
            <DeleteAccount />
          </div>
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
