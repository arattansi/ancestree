import { CHANGELOG, changelogHref, changelogId } from "@/lib/changelog";
import { getSiteUrl } from "@/lib/site-url";

/** Text safe inside an XML element. */
function xml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** The changelog's RSS feed (Step 191): every entry, newest first, as the
 *  library's feed is drawn. An entry's day is read as noon UTC. */
export function GET() {
  const base = getSiteUrl();
  const page = `${base}${changelogHref()}`;
  const items = CHANGELOG.map((entry) => {
    const url = `${page}#${changelogId(entry)}`;
    return `    <item>
      <title>${xml(entry.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      <pubDate>${new Date(`${entry.date}T12:00:00Z`).toUTCString()}</pubDate>
      <description>${xml(entry.items.join(" "))}</description>
    </item>`;
  }).join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>ancestree changelog</title>
    <link>${page}</link>
    <atom:link href="${page}/feed.xml" rel="self" type="application/rss+xml" />
    <description>${xml("Every update to ancestree, dated, newest first.")}</description>
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
