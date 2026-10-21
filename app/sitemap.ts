import type { MetadataRoute } from "next";

import { androidHref } from "@/lib/android-app";
import { blogHref, blogPostHref, blogSubmitHref } from "@/lib/blog";
import { listPublishedPosts } from "@/lib/blog.server";
import { changelogHref, changelogUpdated } from "@/lib/changelog";
import { getSiteUrl } from "@/lib/site-url";

/**
 * The sitemap, for Search Console (Step 135): the marketing pages, the
 * library, its form for sending a story in (Step 157), every published
 * post, the changelog, as of its newest entry (Step 191), and the Android
 * app's page (Step 200). Nothing signed in is listed.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteUrl();
  const posts = await listPublishedPosts();
  const pages: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/features`, changeFrequency: "monthly", priority: 0.8 },
    { url: `${base}/manifesto`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/about-us`, changeFrequency: "yearly", priority: 0.6 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}${androidHref()}`, changeFrequency: "monthly", priority: 0.6 },
    {
      url: `${base}${changelogHref()}`,
      lastModified: changelogUpdated(),
      changeFrequency: "weekly",
      priority: 0.7,
    },
    {
      url: `${base}${blogHref()}`,
      lastModified: posts[0]?.publishedAt ?? undefined,
      changeFrequency: "weekly",
      priority: 0.9,
    },
    { url: `${base}${blogSubmitHref()}`, changeFrequency: "yearly", priority: 0.5 },
  ];
  return pages.concat(
    posts.map((p) => ({
      url: `${base}${blogPostHref(p.slug)}`,
      lastModified: p.updatedAt,
      changeFrequency: "yearly",
      priority: 0.7,
    })),
  );
}
