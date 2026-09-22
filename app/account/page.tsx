import type { Metadata } from "next";

import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeCard } from "@/components/account-type-guide";
import {
  DeleteAccount,
  type SuccessorOption,
} from "@/components/delete-account";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { EditDisplayName } from "@/components/edit-display-name";
import { InviteMinter } from "@/components/invite-minter";
import { NotificationsList } from "@/components/notifications-list";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  accountTypeOf,
  branchSideLabel,
  invitableTypes,
} from "@/lib/account-types";
import { getUser, requireProfile } from "@/lib/auth";
import { getBranchSides } from "@/lib/branch.server";
import { listNotifications } from "@/lib/claims";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "your account" };

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
  const accountType = accountTypeOf(profile.role);
  // Roots invite from /admin; everyone else who may, invites from here.
  const inviteOptions = invitableTypes(profile.role);
  // A Branch is told whose side they tend their part of: the Root they're
  // related to.
  const branchSide =
    accountType.entries === "branch" && profile.self_person_id
      ? branchSideLabel(
          (await getBranchSides([profile.self_person_id])).get(
            profile.self_person_id,
          ) ?? [],
        )
      : null;

  // The tree's only Root must name a successor before deleting their account.
  let successors: SuccessorOption[] | null = null;
  if (profile.role === "admin") {
    const { data: members } = await supabase
      .from("member_directory")
      .select("auth_user_id, display_name, role")
      .neq("auth_user_id", profile.auth_user_id);
    const others = (members ?? []).filter(
      (m): m is typeof m & { auth_user_id: string } => !!m.auth_user_id,
    );
    if (!others.some((m) => m.role === "admin")) {
      successors = others
        .map((m) => ({
          userId: m.auth_user_id,
          name: `${m.display_name ?? "Unnamed member"} (${accountTypeOf(m.role).name})`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <h1 className="text-2xl font-semibold tracking-tight">Your account</h1>

      <Card>
        <CardHeader>
          <CardTitle>
            <EditDisplayName name={profile.display_name} />
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <Row label="Email">{user?.email ?? "—"}</Row>
          <Row label="Account">
            <AccountTypeBadge role={profile.role} />
          </Row>
          <Row label="Invited by">
            {directory?.invited_by_name ??
              (profile.role === "admin" ? "Founding Root" : "Unknown")}
          </Row>
          <Row label="Invite rights">
            {inviteOptions.length === 0
              ? "No"
              : inviteOptions.length === 1
                ? `As ${inviteOptions[0].name}s`
                : "Yes"}
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your account type</CardTitle>
          <CardDescription>
            {accountType.entries === "branch"
              ? branchSide
                ? `You tend your part of ${branchSide}: the relatives you’re related through, and the people they married. `
                : "You’re not related to a Root on the tree yet, so there’s no side for you to tend. "
              : null}
            {accountType.runsTree
              ? "You set everyone else’s from the admin page."
              : "A Root sets account types. Ask one if yours should change."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AccountTypeCard type={accountType} />
        </CardContent>
      </Card>

      {!accountType.runsTree && inviteOptions.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Invite a relative</CardTitle>
            <CardDescription>
              Email them an invite and the link signs them straight in — nothing
              for them to set up. Or create a link to send yourself, by message
              or WhatsApp; that one asks for their email first. Either way it is
              tied to you, works once, and expires after 14 days.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <DirectInviteForm options={inviteOptions.map((t) => t.key)} />
            <div className="border-t border-border pt-6">
              <InviteMinter options={inviteOptions.map((t) => t.key)} />
            </div>
          </CardContent>
        </Card>
      ) : null}

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
          <CardTitle>View</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>Light, dark, or follow your device. Saved to this browser.</p>
          <ThemeToggle />
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
            <DeleteAccount successors={successors} />
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

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-foreground">{children}</span>
    </div>
  );
}
