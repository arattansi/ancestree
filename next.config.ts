import { withBotId } from "botid/next/config";
import type { NextConfig } from "next";

/** Supabase Storage host — signed photo URLs are served from here. */
const supabaseHost = (() => {
  try {
    return process.env.NEXT_PUBLIC_SUPABASE_URL
      ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
      : undefined;
  } catch {
    return undefined;
  }
})();

const nextConfig: NextConfig = {
  // Dev only. Cookies are per-host, so 127.0.0.1 is a signed-out browser next
  // to a signed-in localhost — the way to test invites and sign-in by hand.
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    remotePatterns: supabaseHost
      ? [{ protocol: "https", hostname: supabaseHost, pathname: "/storage/v1/object/**" }]
      : [],
  },
};

// Vercel BotID on a birthday card link's signed-out writes (Step 217.3):
// its script and checks go through these rewrites.
export default withBotId(nextConfig);
