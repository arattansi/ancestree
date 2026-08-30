/**
 * Absolute base URL for the current deployment. Used for magic-link redirects
 * and shareable invite links. Prefers the explicit `NEXT_PUBLIC_SITE_URL`, then
 * the Vercel-provided URL, then localhost for dev.
 */
export function getSiteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return stripTrailingSlash(explicit);

  const vercel = process.env.NEXT_PUBLIC_VERCEL_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${stripTrailingSlash(vercel)}`;

  return "http://localhost:3000";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
