import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminBlog } from "@/components/admin/admin-blog";
import { AdminCampaigns } from "@/components/admin/admin-campaigns";
import { AdminMessageReports } from "@/components/admin/admin-message-reports";
import { AdminAccounts, AdminTrees } from "@/components/admin/admin-manage";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { AdminTreeRequests } from "@/components/admin/admin-tree-requests";
import { BackToTop } from "@/components/back-to-top";
import { EngagementDashboard } from "@/components/dashboard/engagement-dashboard";
import { GettingStartedCard } from "@/components/dashboard/getting-started-card";
import {
  NewsletterCard,
  NewsletterCardSkeleton,
} from "@/components/dashboard/newsletter-card";
import { PageColumn } from "@/components/page-column";
import { AccountViewSkeleton } from "@/components/page-skeletons";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { readAdminSearch } from "@/lib/admin-manage";
import { findAccounts, findTrees } from "@/lib/admin-manage.server";
import { readAdminTab } from "@/lib/admin-page";
import { listBlogPosts } from "@/lib/blog.server";
import { listCampaigns } from "@/lib/campaigns.server";
import { listOpenMessageReports } from "@/lib/message-reports.server";
import {
  countSubmissionsWaiting,
  listSubmissions,
} from "@/lib/library-submissions.server";
import { getSiteUrl } from "@/lib/site-url";
import { currentAccess, listMyTrees } from "@/lib/tree-context";
import { adminHref } from "@/lib/tree-links";
import { isBetaReviewer, listTreeRequests } from "@/lib/tree-requests.server";

export const metadata: Metadata = { title: "admin" };

/**
 * The admin page (Step 103), the beta reviewers' own: the weekly
 * newsletter, the engagement numbers (both the account page's dashboard
 * view until now), and what they manage across the site: requests to
 * start a tree, out of every Root console, campaign links (Step 103.3),
 * and accounts and trees to act on (Step 103.4), and the blog's drafts and
 * posts (Step 134). Anyone else is sent on to the Root console, where this
 * address used to lead.
 */
export default async function AdminPage({ searchParams }: PageProps<"/admin">) {
  const [{ tab: requested, account, tree }, reviewer, waiting] = await Promise.all([
    searchParams,
    isBetaReviewer(),
    countSubmissionsWaiting(),
  ]);
  if (!reviewer) redirect(adminHref());
  const tab = readAdminTab(requested);

  return (
    <PageColumn width="3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <AdminPageTabs tab={tab} waiting={{ blog: waiting }} />
      </div>

      <Suspense
        key={tab}
        fallback={
          tab === "newsletter" ? (
            <NewsletterCardSkeleton />
          ) : (
            <AccountViewSkeleton label={`Loading ${tab}…`} />
          )
        }
      >
        {tab === "newsletter" ? (
          <div className="flex flex-col gap-6">
            <NewsletterCard />
            {/* Its own wait: today's dry run reads every member (Step 151). */}
            <Suspense fallback={null}>
              <GettingStartedCard />
            </Suspense>
          </div>
        ) : tab === "analytics" ? (
          <EngagementDashboard />
        ) : tab === "blog" ? (
          <BlogTab />
        ) : (
          <ManageTab
            accountQuery={readAdminSearch(account)}
            treeQuery={readAdminSearch(tree)}
          />
        )}
      </Suspense>
      <BackToTop />
    </PageColumn>
  );
}

/**
 * What a reviewer manages: requests to start a tree, from every tree and
 * the waitlist, campaign links, messages reported in the messenger (Step
 * 177.3), and the accounts and trees their searches (`?account=`,
 * `?tree=`) find. A founder invite for someone on the
 * waitlist comes from the tree they're looking at if they run it, else the
 * first tree they run.
 */
async function ManageTab({
  accountQuery,
  treeQuery,
}: {
  accountQuery: string | null;
  treeQuery: string | null;
}) {
  const [requests, trees, access, campaigns, messageReports, foundAccounts, foundTrees] =
    await Promise.all([
      listTreeRequests(),
      listMyTrees(),
      currentAccess(),
      listCampaigns(),
      listOpenMessageReports(),
      findAccounts(accountQuery),
      findTrees(treeQuery),
    ]);
  const founderTreeId =
    access?.kind === "member" && access.membership.isRoot
      ? access.membership.tree.id
      : (trees.find((t) => t.type.runsTree)?.id ?? null);

  return (
    <>
      <Card id="tree-requests" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Requests to Start a Tree</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTreeRequests treeId={founderTreeId} requests={requests} />
        </CardContent>
      </Card>
      <Card id="campaigns" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Campaign Links</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminCampaigns campaigns={campaigns} baseUrl={getSiteUrl()} />
        </CardContent>
      </Card>
      <Card id="message-reports" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Reported Messages</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminMessageReports reports={messageReports} />
        </CardContent>
      </Card>
      <Card id="accounts" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminAccounts query={accountQuery} accounts={foundAccounts} />
        </CardContent>
      </Card>
      <Card id="trees" className="scroll-mt-20">
        <CardHeader>
          <CardTitle>Trees</CardTitle>
        </CardHeader>
        <CardContent>
          <AdminTrees query={treeQuery} trees={foundTrees} />
        </CardContent>
      </Card>
    </>
  );
}

/**
 * The blog's drafts and posts (Step 134): a draft written here, and every
 * post to edit, preview, publish and delete; above them, the stories sent
 * in to triage (Step 157).
 */
async function BlogTab() {
  const [posts, submissions] = await Promise.all([listBlogPosts(), listSubmissions()]);
  return <AdminBlog posts={posts} submissions={submissions} />;
}
