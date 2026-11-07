import { isOpenKey, PIXEL_GIF_BASE64 } from "@/lib/newsletter-opens";
import { noteNewsletterOpen } from "@/lib/newsletter-engagement.server";

const PIXEL = Uint8Array.from(Buffer.from(PIXEL_GIF_BASE64, "base64"));

/**
 * `GET /api/newsletter/open/<key>`: the one-pixel image in a counting
 * member's copy of a weekly issue (Step 226). Its key is that copy's own and
 * belongs to no member: loading it for the first time marks the copy
 * opened (`note_newsletter_open`), nothing else is read or kept, and every
 * answer is the same image, whatever the key, so it says nothing about
 * which ones are real. Not cached, so a copy opened again still reaches us
 * (and counts once).
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/newsletter/open/[key]">) {
  const { key } = await ctx.params;
  if (isOpenKey(key)) await noteNewsletterOpen(key);
  return new Response(PIXEL, {
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
