import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/site-url";

/**
 * robots.txt (Step 135): the marketing site and the library are anyone's
 * to index; everything a member sees signed in is not.
 */
export default function robots(): MetadataRoute.Robots {
  const base = getSiteUrl();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin",
        "/account",
        "/api/",
        "/auth/",
        "/family",
        "/join",
        "/newsletter",
        "/onboarding",
        "/people",
        "/shared/",
        "/start/",
        "/stories",
        "/t/",
        "/tree",
        "/trees",
        "/welcome",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
