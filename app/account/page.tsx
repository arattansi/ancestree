import type { Metadata } from "next";

import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { switchTreeForm } from "@/app/actions/current-tree";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeCard } from "@/components/account-type-guide";
import {
  AccountViewToggle,
  type AccountView,
} from "@/components/account-view-toggle";
import { AdminConsole } from "@/components/admin/admin-console";
import { BackToTop } from "@/components/back-to-top";
import { ClearNotificationsButton } from "@/components/clear-notifications-button";
import { DeleteAccount, type SoleRootTree } from "@/components/delete-account";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { EditDisplayName } from "@/components/edit-display-name";
import { HomeTreePicker } from "@/components/home-tree-picker";
import { InviteMinter } from "@/components/invite-minter";
import { NotificationsList } from "@/components/notifications-list";
import { PersonForm } from "@/components/person-form";
import { RelayInvites, type PendingRelay } from "@/components/relay-invites";
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
  BRANCHES_PER_ROOT,
  accountTypeOf,
  branchSideLabel,
  countOf,
} from "@/lib/account-types";
import { getUser, requireProfile, type Profile } from "@/lib/auth";
import { getBranchSides } from "@/lib/branch.server";
import { listNotifications } from "@/lib/claims";
import { RELAY_ANSWERED, readRelayParam } from "@/lib/invite-relays";
import { loadOwnEntry, type OwnEntry } from "@/lib/own-entry.server";
import { createClient } from "@/lib/supabase/server";
import {
  currentAccess,
  listMyTrees,
  membershipOf,
  type MyTree,
  type TreeMembership,
} from "@/lib/tree-context";
import {
  adminHref,
  newTreeHref,
  onboardingHref,
  treeHref,
  treesHref,
} from "@/lib/tree-links";

export async function generateMetadata({
  searchParams,
}: PageProps<"/account">): Promise<Metadata> {
  const { view } = await searchParams;
  if (view === "admin") {
    return {
      title: "admin",
      description: "Manage members, invites, disputes, and entry counts.",
    };
  }
  if (view === "settings") return { title: "settings" };
  return { title: "your account" };
}

/**
 * The account page, in three views: your profile — your own entry, as a
 * form — then, for a Root, the admin console (`?view=admin`) of the tree
 * they're looking at, or of the first tree they run when the current one
 * isn't theirs to run; and settings (`?view=settings`) for everything else.
 * The email about a relative's ask opens settings (`&relay=<id>`, Step
 * 30.5), where the invite waits filled in.
 */
export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const { view: requested, relay } = await searchParams;
  const profile = await requireProfile();
  const [user, trees, access, ownEntry] = await Promise.all([
    getUser(),
    listMyTrees(),
    currentAccess(),
    loadOwnEntry(profile),
  ]);

  const runs = trees.filter((t) => t.type.runsTree);
  let console: TreeMembership | null = null;
  if (requested === "admin" && runs.length > 0) {
    if (access?.kind === "member" && access.membership.isRoot) {
      console = access.membership;
    } else {
      console = (await membershipOf(runs[0].id)).membership ?? null;
    }
  }
  const view: AccountView = console
    ? "admin"
    : requested === "settings"
      ? "settings"
      : "profile";

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Your Account
          </h1>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>Signed in as {user?.email ?? "—"}</span>
            <span aria-hidden>·</span>
            <span className="flex items-center gap-1">
              Known to members as
              <EditDisplayName name={profile.display_name} />
            </span>
          </div>
        </div>
        <AccountViewToggle
          view={view}
          consoleTreeId={console?.tree.id ?? runs[0]?.id ?? null}
          adminTrees={runs}
        />
      </div>

      {view === "admin" && console ? (
        <AdminConsole membership={console} />
      ) : view === "settings" ? (
        <SettingsView
          profile={profile}
          trees={trees}
          currentTreeId={
            access?.kind === "member" ? access.membership.tree.id : null
          }
          openedRelayId={readRelayParam(relay)}
        />
      ) : (
        <ProfileView ownEntry={ownEntry} />
      )}
      <BackToTop />
    </main>
  );
}

/** Your own entry — what your card says on every tree — as a form. */
function ProfileView({ ownEntry }: { ownEntry: OwnEntry | null }) {
  if (!ownEntry) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
          <CardDescription>
            You don&rsquo;t have an entry of your own yet. Find yourself on the
            tree, or add yourself, and your details will live here.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            nativeButton={false}
            render={<Link href={onboardingHref()} />}
          >
            Find yourself on the tree
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Details</CardTitle>
        <CardDescription>
          What your own card says on every tree you&rsquo;re on. Yours to keep
          up to date; a relative who wants something changed flags it on the
          tree.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PersonForm
          treeId={ownEntry.homeTreeId}
          isAdmin={ownEntry.isHomeRoot}
          person={ownEntry.person}
          photoUrl={ownEntry.photoUrl}
          placeLabels={ownEntry.placeLabels}
          withContact
        />
      </CardContent>
    </Card>
  );
}

/**
 * Settings: relatives asking you for an invite, your trees, your entry
 * across them, appearance, privacy, invites you may send, your inbox, and
 * signing out — cards in two columns, the wide ones spanning both.
 */
async function SettingsView({
  profile,
  trees,
  currentTreeId,
  openedRelayId,
}: {
  profile: Profile;
  trees: MyTree[];
  /** The tree they're looking at, if they're a member of it. */
  currentTreeId: string | null;
  /** The ask named by the email's button (`relayHref`), if that's how they came. */
  openedRelayId: string | null;
}) {
  const user = await getUser();

  const supabase = await createClient();
  const [
    notifications,
    { data: directory },
    { data: relayRows },
    { data: madeBranches },
  ] = await Promise.all([
    user ? listNotifications(user.id) : Promise.resolve([]),
    supabase
      .from("member_directory")
      .select("tree_id, invited_by_name")
      .eq("auth_user_id", profile.auth_user_id),
    // Asks passed on to them from request access (Step 30.5): RLS shows
    // each only to the member it went to.
    supabase
      .from("invite_relays")
      .select("id, first_name, last_name, email, created_at")
      .eq("recipient_user_id", profile.auth_user_id)
      .eq("status", "pending")
      .order("created_at", { ascending: true }),
    // The Branches they've made, tree by tree: each Root makes up to four
    // (Step 39).
    supabase
      .from("tree_members")
      .select("tree_id")
      .eq("branch_granted_by", profile.auth_user_id),
  ]);
  const invitedByTree = new Map(
    (directory ?? []).map((d) => [d.tree_id, d.invited_by_name]),
  );
  const branchesMadeByTree = new Map<string, number>();
  for (const { tree_id } of madeBranches ?? []) {
    branchesMadeByTree.set(tree_id, (branchesMadeByTree.get(tree_id) ?? 0) + 1);
  }
  const relays: PendingRelay[] = (relayRows ?? []).map((r) => ({
    id: r.id,
    firstName: r.first_name,
    lastName: r.last_name,
    email: r.email,
    createdAt: r.created_at,
  }));
  // Opened from the email after it was answered (or signed in as someone
  // else): say so, rather than show nothing.
  const openedRelayGone =
    openedRelayId !== null && !relays.some((r) => r.id === openedRelayId);

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

  // Inviting from here: every tree they don't run (Roots invite from the
  // admin page). Whoever they invite joins as a Leaf.
  const inviteFrom = trees.filter((t) => !t.type.runsTree);
  const founded = trees.some((t) => t.founded);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {relays.length > 0 || openedRelayGone ? (
        <Card id="relatives-asking" className="md:col-span-2">
          <CardHeader>
            <CardTitle>Relatives Asking for an Invite</CardTitle>
            <CardDescription>
              They couldn&rsquo;t find themselves on a tree, so they gave us
              your address. If you know them, send the invite: it&rsquo;s
              filled in from what they typed. If you don&rsquo;t, dismiss it;
              they aren&rsquo;t told either way.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {openedRelayGone ? (
              <p className="text-sm text-muted-foreground">{RELAY_ANSWERED}</p>
            ) : null}
            {relays.length > 0 ? (
              <RelayInvites
                relays={relays}
                trees={trees.map((t) => ({ id: t.id, name: t.name }))}
                defaultTreeId={currentTreeId}
              />
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your Trees</CardTitle>
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
              <div
                key={t.id}
                className="flex flex-col gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <form action={switchTreeForm.bind(null, t.id, treeHref())}>
                    <button
                      type="submit"
                      className="font-medium hover:underline"
                    >
                      {t.name}
                    </button>
                  </form>
                  <span className="flex items-center gap-2">
                    {t.type.runsTree ? (
                      <form
                        action={switchTreeForm.bind(null, t.id, adminHref())}
                      >
                        <button
                          type="submit"
                          className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
                        >
                          Admin console
                        </button>
                      </form>
                    ) : null}
                    <AccountTypeBadge role={t.role} />
                  </span>
                </div>
                <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <dt>Invited by</dt>
                  <dd className="text-foreground">
                    {invitedByTree.get(t.id) ??
                      (t.founded
                        ? "You founded it"
                        : t.type.runsTree
                          ? "Founding Root"
                          : "Unknown")}
                  </dd>
                  <dt>Invite rights</dt>
                  <dd className="text-foreground">As Leaves</dd>
                  {t.type.runsTree ? (
                    <>
                      <dt>Branches made</dt>
                      <dd className="text-foreground">
                        {countOf(
                          branchesMadeByTree.get(t.id) ?? 0,
                          BRANCHES_PER_ROOT,
                        )}
                      </dd>
                    </>
                  ) : null}
                  {t.type.addRelatives === "line" ? (
                    <>
                      <dt>Adds relatives</dt>
                      <dd className="text-foreground">
                        On your own line. A Root can make you a Branch, to look
                        after more of the family.
                      </dd>
                    </>
                  ) : null}
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
            <CardTitle>Your Entry</CardTitle>
            <CardDescription>
              One entry, shown on{" "}
              {shownOn.length === 1 ? "one tree" : `${shownOn.length} trees`}:{" "}
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

      <Card>
        <CardHeader>
          <CardTitle>View</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>Light, dark, or follow your device. Saved to this browser.</p>
          <ThemeToggle />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy &amp; Your Data</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm text-muted-foreground">
          <p>
            Read how your family&rsquo;s data is stored and protected in the{" "}
            <Link href="/privacy" className="underline underline-offset-4">
              privacy notice
            </Link>
            .
          </p>
          <div>
            <DeleteAccount
              soleRootTrees={soleRootTrees}
              madeBranches={branchesMadeByTree.size > 0}
            />
          </div>
        </CardContent>
      </Card>

      {inviteFrom.map((t) => {
        return (
          <Card key={t.id}>
            <CardHeader>
              <CardTitle>Invite a Relative to {t.name}</CardTitle>
              <CardDescription>
                Email them an invite and the link signs them straight in —
                nothing for them to set up. Or create a link to send yourself,
                by message or WhatsApp; that one asks for their email first.
                Either way it is tied to you, works once, and expires after 14
                days.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              <DirectInviteForm treeId={t.id} />
              <div className="border-t border-border pt-6">
                <InviteMinter treeId={t.id} />
              </div>
            </CardContent>
          </Card>
        );
      })}

      <Card className="md:col-span-2">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle>Notifications</CardTitle>
            <ClearNotificationsButton items={notifications} />
          </div>
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

      <form action={signOut} className="md:col-span-2">
        <Button type="submit" variant="outline">
          Sign out
        </Button>
      </form>
    </div>
  );
}
