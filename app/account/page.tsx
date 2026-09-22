import type { Metadata } from "next";

import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeCard } from "@/components/account-type-guide";
import {
  DeleteAccount,
  type SoleRootTree,
} from "@/components/delete-account";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { EditDisplayName } from "@/components/edit-display-name";
import { HomeTreePicker } from "@/components/home-tree-picker";
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
import { listMyTrees } from "@/lib/tree-context";
import { newTreeHref, treeHref, treesHref } from "@/lib/tree-links";

export const metadata: Metadata = { title: "your account" };

export default async function AccountPage() {
  const profile = await requireProfile();
  const user = await getUser();

  const supabase = await createClient();
  const [trees, notifications, { data: directory }] = await Promise.all([
    listMyTrees(),
    user ? listNotifications(user.id) : Promise.resolve([]),
    supabase
      .from("member_directory")
      .select("tree_id, invited_by_name")
      .eq("auth_user_id", profile.auth_user_id),
  ]);
  const invitedByTree = new Map(
    (directory ?? []).map((d) => [d.tree_id, d.invited_by_name]),
  );

  // The member's own entry across trees: where it lives, where it shows.
  let home: { id: string; name: string } | null = null;
  let shownOn: { id: string; name: string }[] = [];
  let hidden = false;
  if (profile.self_person_id) {
    const [{ data: self }, { data: placements }] = await Promise.all([
      supabase
        .from("people")
        .select("tree_id, hidden_from_visitors")
        .eq("id", profile.self_person_id)
        .maybeSingle(),
      supabase
        .from("tree_placements")
        .select("tree_id, trees(name)")
        .eq("person_id", profile.self_person_id)
        .eq("status", "active"),
    ]);
    hidden = self?.hidden_from_visitors ?? false;
    shownOn = (placements ?? []).flatMap((p) => {
      const t = Array.isArray(p.trees) ? p.trees[0] : p.trees;
      return t?.name ? [{ id: p.tree_id, name: t.name }] : [];
    });
    home = shownOn.find((t) => t.id === self?.tree_id) ?? null;
  }

  // What each Branch membership tends: the Root they're related to there.
  const branchSideByTree = new Map<string, string | null>();
  for (const t of trees) {
    if (t.type.entries !== "branch" || !profile.self_person_id) continue;
    const sides = await getBranchSides([profile.self_person_id], t.id);
    branchSideByTree.set(
      t.id,
      branchSideLabel(sides.get(profile.self_person_id) ?? []),
    );
  }

  // Every tree they are the only Root of needs a successor before they go.
  const soleRootTrees: SoleRootTree[] = [];
  for (const t of trees) {
    if (!t.type.runsTree) continue;
    const { data: members } = await supabase
      .from("member_directory")
      .select("auth_user_id, display_name, role")
      .eq("tree_id", t.id)
      .neq("auth_user_id", profile.auth_user_id);
    const others = (members ?? []).filter(
      (m): m is typeof m & { auth_user_id: string } => !!m.auth_user_id,
    );
    if (others.some((m) => m.role === "admin")) continue;
    soleRootTrees.push({
      treeId: t.id,
      treeName: t.name,
      successors: others
        .map((m) => ({
          userId: m.auth_user_id,
          name: `${m.display_name ?? "Unnamed member"} (${accountTypeOf(m.role).name})`,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    });
  }

  // Inviting from here: trees where they may invite but don't run the tree
  // (Roots invite from the admin page).
  const inviteFrom = trees.filter(
    (t) => !t.type.runsTree && invitableTypes(t.role).length > 0,
  );
  const founded = trees.some((t) => t.founded);

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
          <Row label="Trees">
            {trees.length === 0 ? "None yet" : trees.map((t) => t.name).join(", ")}
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your trees</CardTitle>
          <CardDescription>
            Your account type on each tree, set by that tree&rsquo;s Roots.{" "}
            <Link href={treesHref()} className="underline underline-offset-4">
              See them all
            </Link>
            .
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {trees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              You&rsquo;re not on a tree yet.
            </p>
          ) : null}
          {trees.map((t) => {
            const side = branchSideByTree.get(t.id);
            return (
              <div key={t.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={treeHref(t.slug)} className="font-medium hover:underline">
                    {t.name}
                  </Link>
                  <AccountTypeBadge role={t.role} />
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <dt>Invited by</dt>
                  <dd className="text-foreground">
                    {invitedByTree.get(t.id) ??
                      (t.founded ? "You founded it" : t.type.runsTree ? "Founding Root" : "Unknown")}
                  </dd>
                  <dt>Invite rights</dt>
                  <dd className="text-foreground">
                    {invitableTypes(t.role).length === 0
                      ? "No"
                      : invitableTypes(t.role).length === 1
                        ? `As ${invitableTypes(t.role)[0].name}s`
                        : "Yes"}
                  </dd>
                  {t.type.entries === "branch" ? (
                    <>
                      <dt>Tends</dt>
                      <dd className="text-foreground">
                        {side
                          ? `Your part of ${side}`
                          : "Not related to a Root here yet"}
                      </dd>
                    </>
                  ) : null}
                </dl>
                <details className="text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">
                    What a {t.type.name} can do here
                  </summary>
                  <div className="pt-2">
                    <AccountTypeCard type={t.type} />
                  </div>
                </details>
              </div>
            );
          })}
          {!founded ? (
            <Button
              nativeButton={false}
              render={<Link href={newTreeHref()} />}
              size="sm"
              variant="outline"
              className="self-start"
            >
              Start a tree of your own
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {profile.self_person_id && home ? (
        <Card>
          <CardHeader>
            <CardTitle>Your entry</CardTitle>
            <CardDescription>
              One entry, shown on {shownOn.length === 1 ? "one tree" : `${shownOn.length} trees`}:{" "}
              {shownOn.map((t) => t.name).join(", ")}. A Root asks before
              showing it on theirs; you can answer from your inbox below.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <HomeTreePicker
              personId={profile.self_person_id}
              homeTreeId={home.id}
              options={shownOn}
              hiddenFromVisitors={hidden}
            />
          </CardContent>
        </Card>
      ) : null}

      {inviteFrom.map((t) => {
        const options = invitableTypes(t.role);
        return (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>Invite a relative to {t.name}</CardTitle>
              <CardDescription>
                Email them an invite and the link signs them straight in — nothing
                for them to set up. Or create a link to send yourself, by message
                or WhatsApp; that one asks for their email first. Either way it is
                tied to you, works once, and expires after 14 days.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <DirectInviteForm treeId={t.id} options={options.map((o) => o.key)} />
              <div className="border-t border-border pt-6">
                <InviteMinter treeId={t.id} options={options.map((o) => o.key)} />
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card>
        <CardHeader>
          <CardTitle>Notifications</CardTitle>
          <CardDescription>
            {trees.length > 1
              ? "One inbox per tree; each item says which."
              : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {trees.length > 1 ? (
            trees.map((t) => {
              const items = notifications.filter((n) => n.treeId === t.id);
              return (
                <section key={t.id} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <NotificationsList items={items} />
                </section>
              );
            })
          ) : (
            <NotificationsList items={notifications} />
          )}
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
            . For a full JSON copy of a tree, or to remove a specific entry,
            ask one of its Roots.
          </p>
          <div>
            <DeleteAccount soleRootTrees={soleRootTrees} />
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
