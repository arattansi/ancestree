/**
 * Google's consent mode for Analytics (Step 137): where the law asks
 * before a cookie is set — the European Economic Area, the UK and
 * Switzerland — Analytics starts with its cookie denied and runs
 * cookieless until the visitor allows it. Everyone else is unaffected.
 * Pure, for the layout, the banner and their tests.
 */

/** ISO 3166-1 codes, as Google's `region` takes them and Vercel's header gives them. */
export const CONSENT_REGIONS = [
  // The EEA: the EU, plus Iceland, Liechtenstein and Norway.
  "AT",
  "BE",
  "BG",
  "HR",
  "CY",
  "CZ",
  "DK",
  "EE",
  "FI",
  "FR",
  "DE",
  "GR",
  "HU",
  "IE",
  "IT",
  "LV",
  "LT",
  "LU",
  "MT",
  "NL",
  "PL",
  "PT",
  "RO",
  "SK",
  "SI",
  "ES",
  "SE",
  "IS",
  "LI",
  "NO",
  // The UK and Switzerland, with the same rule of their own.
  "GB",
  "CH",
] as const;

/** Where the banner shows: a country the header names that's on the list. Unknown, it doesn't. */
export function needsConsent(country: string | null | undefined): boolean {
  if (!country) return false;
  return (CONSENT_REGIONS as readonly string[]).includes(country.toUpperCase());
}

/** The visitor's answer, kept in their browser. */
export const CONSENT_KEY = "ancestree-analytics-consent";
export type ConsentChoice = "granted" | "denied";

export function readConsentChoice(raw: string | null): ConsentChoice | null {
  return raw === "granted" || raw === "denied" ? raw : null;
}

/**
 * The script that runs before Analytics loads: Google's defaults for the
 * listed regions (its cookie denied unless the visitor allowed it before),
 * and ads signals denied everywhere, which ancestree never uses.
 */
export function consentDefaultScript(): string {
  const regions = JSON.stringify(CONSENT_REGIONS);
  return [
    "window.dataLayer=window.dataLayer||[];",
    "function gtag(){dataLayer.push(arguments)}",
    "var c=null;try{c=localStorage.getItem(" +
      JSON.stringify(CONSENT_KEY) +
      ")}catch(e){}",
    "gtag('consent','default',{ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});",
    "gtag('consent','default',{analytics_storage:c==='granted'?'granted':'denied',region:" +
      regions +
      "});",
  ].join("");
}
