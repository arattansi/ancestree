import type { Metadata } from "next";

/**
 * A marketing page's meta title and description, as Aalim wrote them on
 * its Marketing Site page in Notion (Step 188): the title used as written,
 * not the app's "… · ancestree", and both on the link preview too. Setting
 * openGraph drops the site's own picture, so it's named here.
 */
export function marketingMetadata(title: string, description: string): Metadata {
  return {
    title: { absolute: title },
    description,
    openGraph: {
      type: "website",
      siteName: "ancestree",
      title,
      description,
      images: [{ url: "/opengraph-image" }],
    },
  };
}
