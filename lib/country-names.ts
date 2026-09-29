/** Pure ISO-3166 helpers, safe on client and server. */

const regionNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

/** ISO alpha-2 -> English country name ("TZ" -> "Tanzania"). */
export function countryName(code: string | null | undefined): string {
  if (!code) return "";
  const cc = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(cc)) return code;
  try {
    return regionNames?.of(cc) ?? cc;
  } catch {
    return cc;
  }
}

/**
 * Where the `places` rows for whole countries start (Step 79): a place of
 * birth can be just a country. GeoNames' own ids stay far below this, and a
 * Root's hand-added places start at 10,000,000,000.
 */
export const COUNTRY_PLACE_ID_BASE = 9_000_000_000;

/**
 * A country's `places.id`: the base plus its two letters' character codes
 * ("TZ" is 9,000,008,490). Migration `20260928190000_country_places` makes
 * the same ids in SQL.
 */
export function countryPlaceId(code: string): number {
  const cc = code.trim().toUpperCase();
  return COUNTRY_PLACE_ID_BASE + cc.charCodeAt(0) * 100 + cc.charCodeAt(1);
}

/** Whether a `places` row is a whole country rather than a town (Step 79). */
export function isCountryPlace(place: { feature_code: string | null }): boolean {
  // GeoNames files countries under PCL (PCLI, PCLD…); ours are plain PCL.
  return place.feature_code?.startsWith("PCL") ?? false;
}

/** The same from a place's id alone, where only the id is at hand. */
export function isCountryPlaceId(id: number): boolean {
  return id >= COUNTRY_PLACE_ID_BASE && id < COUNTRY_PLACE_ID_BASE + 10_000;
}

/** Every ISO-3166-1 alpha-2 code, for the "add a place" country picker. */
export const ALPHA2: readonly string[] = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
];
