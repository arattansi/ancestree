/**
 * Whether a header link to `href` is the page being shown: that page, or
 * one under it unless `exact` (Step 61: **tree** is exact, so it isn't lit
 * beside **connections** on /tree/review).
 */
export function isNavActive(
  pathname: string,
  href: string,
  exact = false,
): boolean {
  if (pathname === href) return true;
  return !exact && pathname.startsWith(`${href}/`);
}
