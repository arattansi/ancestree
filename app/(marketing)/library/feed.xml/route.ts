import { BLOG_NAME, blogExcerpt, blogHref, blogPostHref } from "@/lib/blog";
import { listPublishedPosts } from "@/lib/blog.server";
import { getSiteUrl } from "@/lib/site-url";

/** Text safe inside an XML element. */
function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The library's RSS feed (Step 135): every published post, newest first. */
export async function GET() {
  const base = getSiteUrl();
  const posts = await listPublishedPosts();
  const items = posts
    .map((p) => {
      const url = `${base}${blogPostHref(p.slug)}`;
      return `    <item>
      <title>${xml(p.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(p.publishedAt ?? p.updatedAt).toUTCString()}</pubDate>
      <description>${xml(blogExcerpt(p.body, 400))}</description>
    </item>`;
    })
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${xml(BLOG_NAME)}</title>
    <link>${base}${blogHref()}</link>
    <atom:link href="${base}${blogHref()}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xml("Stories of our wise: the people our families came from, on ancestree.")}</description>
    <language>en</language>
${items}
  </channel>
</rss>
`;
  return new Response(body, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, max-age=300",
    },
  });
}
