import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AdminBlog } from "@/components/admin/admin-blog";
import { AdminCampaigns } from "@/components/admin/admin-campaigns";
import { AdminAccounts, AdminTrees } from "@/components/admin/admin-manage";
import { AdminPageTabs } from "@/components/admin/admin-page-tabs";
import { AdminTreeRequests } from "@/components/admin/admin-tree-requests";
import { BackToTop } from "@/components/back-to-top";
import { EngagementDashboard } from "@/components/dashboard/engagement-dashboard";
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
  const [{ tab: requested, account, tree }, reviewer] = await Promise.all([
    searchParams,
    isBetaReviewer(),
  ]);
  if (!reviewer) redirect(adminHref());
  const tab = readAdminTab(requested);

  return (
    <PageColumn width="3xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Admin</h1>
        <AdminPageTabs tab={tab} />
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
          <NewsletterCard />
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
 * the waitlist, campaign links, and the accounts and trees their searches
 * (`?account=`, `?tree=`) find. A founder invite for someone on the
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
  const [requests, trees, access, campaigns, foundAccounts, foundTrees] =
    await Promise.all([
      listTreeRequests(),
      listMyTrees(),
      currentAccess(),
      listCampaigns(),
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
 * post to edit, preview, publish and delete.
 */
async function BlogTab() {
  const posts = await listBlogPosts();
  return (
    <Card id="blog" className="scroll-mt-20">
      <CardHeader>
        <CardTitle>Stories of Our Wise</CardTitle>
      </CardHeader>
      <CardContent>
        <AdminBlog posts={posts} />
      </CardContent>
    </Card>
  );
}
