import type { Metadata } from "next";
import { Suspense } from "react";

import Link from "next/link";

import { signOut } from "@/app/actions/auth";
import { AccountTypeBadge } from "@/components/account-type-badge";
import { AccountTypeCard } from "@/components/account-type-guide";
import {
  AccountViewToggle,
  type AccountView,
} from "@/components/account-view-toggle";
import { AdminConsole } from "@/components/admin/admin-console";
import { BackToTop } from "@/components/back-to-top";
import {
  ClearNotificationsButton,
} from "@/components/clear-notifications-button";
import {
  EngagementDashboard,
} from "@/components/dashboard/engagement-dashboard";
import {
  NewsletterCard,
  NewsletterCardSkeleton,
} from "@/components/dashboard/newsletter-card";
import { DeleteAccount } from "@/components/delete-account";
import { DirectInviteForm } from "@/components/direct-invite-form";
import { EditDisplayName } from "@/components/edit-display-name";
import { HomeTreePicker } from "@/components/home-tree-picker";
import { NotificationsList } from "@/components/notifications-list";
import { PageColumn } from "@/components/page-column";
import { AccountViewSkeleton } from "@/components/page-skeletons";
import { PersonForm } from "@/components/person-form";
import { PlacementAsks } from "@/components/placement-asks";
import { RelativesCanAsk } from "@/components/relatives-can-ask";
import { RelayInvites } from "@/components/relay-invites";
import { SubmitButton } from "@/components/submit-button";
import { ThemeToggle } from "@/components/theme-toggle";
import { WeeklyNewsletter } from "@/components/weekly-newsletter";
import { TreeTarget } from "@/components/tree-target";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { BRANCHES_PER_ROOT, countOf } from "@/lib/account-types";
import { loadAccountSettings } from "@/lib/account-settings.server";
import { getSessionUser, requireProfile, type Profile } from "@/lib/auth";
import { readRelayParam } from "@/lib/invite-relays";
import { INVITE_LIFETIME_DAYS } from "@/lib/limits";
import {
  loadOwnEntry,
  ownHeldBack,
  ownPlaceholderId,
} from "@/lib/own-entry.server";
import {
  currentAccess,
  listMyTrees,
  membershipOf,
  type MyTree,
  type TreeMembership,
} from "@/lib/tree-context";
import { isBetaReviewer } from "@/lib/tree-requests.server";
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
      title: "root",
      description: "Manage members, invites, reports, and entry counts.",
    };
  }
  if (view === "dashboard" && (await isBetaReviewer())) {
    return { title: "dashboard" };
  }
  if (view === "settings") return { title: "settings" };
  return { title: "your account" };
}

/**
 * The account page, in four views: your profile — your own entry, as a
 * form — then, for a Root, the admin console (`?view=admin`) of the tree
 * they're looking at, or of the first tree they run when the current one
 * isn't theirs to run; for a beta reviewer, the engagement dashboard
 * (`?view=dashboard`, Step 56); and settings (`?view=settings`) for
 * everything else. The email about a relative's ask opens settings
 * (`&relay=<id>`, Step 30.5), where the invite waits filled in.
 */
export default async function AccountPage({
  searchParams,
}: PageProps<"/account">) {
  const { view: requested, relay } = await searchParams;
  // All of it needs only the session, so it's asked for at once (Step
  // 77.1); each view then reads what it shows, and only that.
  const [profile, user, trees, access, reviewer] = await Promise.all([
    requireProfile(),
    getSessionUser(),
    listMyTrees(),
    currentAccess(),
    isBetaReviewer(),
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
    : requested === "dashboard" && reviewer
      ? "dashboard"
      : requested === "settings"
        ? "settings"
        : "profile";

  return (
    <PageColumn width="3xl">
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
          dashboard={reviewer}
        />
      </div>

      {/* Each view reads its own data behind its own boundary (Step 77.3):
          choosing another shows its shape at once, under the buttons that
          are already there, rather than leaving the last view up. */}
      <Suspense
        key={`${view}:${console?.tree.id ?? ""}`}
        fallback={<AccountViewSkeleton label={`Loading ${view}…`} />}
      >
        {view === "admin" && console ? (
          <AdminConsole membership={console} />
        ) : view === "dashboard" ? (
          <div className="flex flex-col gap-6">
            {/* Its preview reads every tree of theirs: the numbers don't wait. */}
            <Suspense fallback={<NewsletterCardSkeleton />}>
              <NewsletterCard />
            </Suspense>
            <EngagementDashboard />
          </div>
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
          <ProfileView profile={profile} />
        )}
      </Suspense>
      <BackToTop />
    </PageColumn>
  );
}

/** Your own entry — what your card says on every tree — as a form. */
async function ProfileView({ profile }: { profile: Profile }) {
  const ownEntry = await loadOwnEntry(profile);
  // A child's own placeholder (Step 98.3): theirs to see, not to change,
  // and hidden from the family until their parent shows it.
  const placeholderId = ownEntry ? null : await ownPlaceholderId(profile);
  if (placeholderId) {
    const rows = await ownHeldBack(placeholderId);
    return (
      <Card>
        <CardHeader>
          <CardTitle>Your Details</CardTitle>
          <CardDescription>
            Your details are hidden from the family until your parent
            approves.
          </CardDescription>
        </CardHeader>
        {rows.length > 0 ? (
          <CardContent>
            <dl className="grid grid-cols-2 gap-4">
              {rows.map((r) => (
                <div key={r.group} className="flex flex-col gap-0.5">
                  <dt className="text-xs text-muted-foreground">{r.label}</dt>
                  <dd className="text-sm">{r.value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        ) : null}
      </Card>
    );
  }
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
          self
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
  const {
    notifications,
    invitedByTree,
    branchesMadeByTree,
    relays,
    openedRelayGone,
    openedRelayLine,
    home,
    shownOn,
    hidden,
    branchSideByTree,
    soleRootTrees,
    asks,
    newsletterOn,
  } = await loadAccountSettings(profile, trees, openedRelayId);

  // Inviting from here: every tree they don't run (Roots invite from the
  // admin page). Whoever they invite joins as a Leaf.
  const inviteFrom = trees.filter((t) => !t.type.runsTree);
  const founded = trees.some((t) => t.founded);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      {asks.length > 0 ? (
        <Card id="asked-of-you" className="scroll-mt-24 md:col-span-2">
          <CardHeader>
            <CardTitle>Asked of You</CardTitle>
            <CardDescription>
              These trees show a name and place of birth already. The rest
              shows once approved.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PlacementAsks asks={asks} />
          </CardContent>
        </Card>
      ) : null}

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
            {openedRelayLine ? (
              <p className="text-sm text-muted-foreground">{openedRelayLine}</p>
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
                  <TreeTarget
                    treeId={t.id}
                    currentTreeId={currentTreeId}
                    href={treeHref()}
                    variant="link"
                    className="h-auto border-0 p-0 whitespace-normal text-inherit underline-offset-auto"
                  >
                    {t.name}
                  </TreeTarget>
                  <span className="flex items-center gap-2">
                    {t.type.runsTree ? (
                      <TreeTarget
                        treeId={t.id}
                        currentTreeId={currentTreeId}
                        href={adminHref()}
                        variant="link"
                        className="relative tap-target h-auto border-0 p-0 text-xs font-normal text-muted-foreground underline hover:text-foreground"
                      >
                        Root console
                      </TreeTarget>
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
              {shownOn.map((t) => t.name).join(", ")}. Other trees can show
              your name and place of birth; the rest waits for your yes.
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
          <RelativesCanAsk on={profile.relatives_can_ask} />
          <div>
            <DeleteAccount soleRootTrees={soleRootTrees} />
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
                nothing for them to set up. It is tied to you, works once, and
                expires after {INVITE_LIFETIME_DAYS} days. For a link to share
                in a family group chat, ask a Root.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DirectInviteForm treeId={t.id} />
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
          <WeeklyNewsletter on={newsletterOn} />
          {trees.length > 1 ? (
            trees.map((t) => {
              const items = notifications.filter((n) => n.treeId === t.id);
              return (
                <section key={t.id} className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">{t.name}</h3>
                  <NotificationsList
                    items={items}
                    currentTreeId={currentTreeId}
                  />
                </section>
              );
            })
          ) : (
            <NotificationsList
              items={notifications}
              currentTreeId={currentTreeId}
            />
          )}
        </CardContent>
      </Card>

      <form action={signOut} className="md:col-span-2">
        <SubmitButton variant="outline" pendingLabel="Signing out…">
          Sign out
        </SubmitButton>
      </form>
    </div>
  );
}
