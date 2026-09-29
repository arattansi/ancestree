/**
 * Region names a member might type after a place ("Vancouver, BC",
 * "Kalavad, Gujarat"), for the place search to prefer places there (Step 66).
 * Pure data, lowercase ASCII, used by lib/place-search.ts.
 *
 * A country is matched by its English name (Intl), its ISO code, and the
 * other names below. A state or province is matched by its GeoNames admin1
 * code when that code is letters ("WA", "ENG") and by the names below, keyed
 * the way GeoNames keys admin1 ("CA.02" is British Columbia). Canada's and
 * India's codes are numbers, which the picker's label never shows, so without
 * these names "Vancouver, BC" could only go by population. Each numeric code
 * was checked against the biggest places GeoNames files under it (CA.02 →
 * Vancouver, CA.08 → Toronto, IN.09 → Ahmedabad, IN.16 → Mumbai, …).
 */

/**
 * Other names for a country: everyday ones, and older ones family records use.
 * Typed alone, each also finds the country itself (Step 79), except a name for
 * only part of it (Zanzibar).
 */
export const COUNTRY_OTHER_NAMES: Readonly<Record<string, readonly string[]>> = {
  AE: ["uae"],
  CD: ["zaire", "drc", "dr congo", "democratic republic of the congo", "belgian congo"],
  CG: ["republic of the congo"],
  CI: ["ivory coast"],
  CV: ["cabo verde"],
  CZ: ["czech republic"],
  GB: ["uk", "britain", "great britain"],
  HK: ["hong kong"],
  IR: ["persia"],
  LK: ["ceylon"],
  MK: ["macedonia"],
  MM: ["burma"],
  MO: ["macau", "macao"],
  MW: ["nyasaland"],
  NL: ["holland"],
  PS: ["palestine"],
  SZ: ["swaziland"],
  TH: ["siam"],
  TL: ["east timor"],
  TR: ["turkey"],
  TZ: ["tanganyika", "zanzibar"],
  US: ["usa", "america", "united states of america"],
  VA: ["holy see"],
  ZM: ["northern rhodesia"],
  ZW: ["rhodesia", "southern rhodesia"],
};

/** Names (and abbreviations) of first-level regions, keyed "CC.admin1". */
export const ADMIN1_NAMES: Readonly<Record<string, readonly string[]>> = {
  // Canada
  "CA.01": ["alberta", "ab", "alta"],
  "CA.02": ["british columbia", "bc"],
  "CA.03": ["manitoba", "mb"],
  "CA.04": ["new brunswick", "nb"],
  "CA.05": ["newfoundland and labrador", "newfoundland", "labrador", "nl", "nfld"],
  "CA.07": ["nova scotia", "ns"],
  "CA.08": ["ontario", "on", "ont"],
  "CA.09": ["prince edward island", "pei", "pe"],
  "CA.10": ["quebec", "qc", "pq"],
  "CA.11": ["saskatchewan", "sk", "sask"],
  "CA.12": ["yukon", "yt"],
  "CA.13": ["northwest territories", "nt", "nwt"],
  "CA.14": ["nunavut", "nu"],

  // United Kingdom
  "GB.ENG": ["england", "eng"],
  "GB.NIR": ["northern ireland", "nir"],
  "GB.SCT": ["scotland", "sct"],
  "GB.WLS": ["wales", "wls"],

  // India
  "IN.01": ["andaman and nicobar islands", "andaman and nicobar"],
  "IN.02": ["andhra pradesh"],
  "IN.03": ["assam"],
  "IN.05": ["chandigarh"],
  "IN.07": ["delhi"],
  "IN.09": ["gujarat", "saurashtra", "kathiawar", "kutch", "kachchh"],
  "IN.10": ["haryana"],
  "IN.11": ["himachal pradesh"],
  "IN.12": ["jammu and kashmir"],
  "IN.13": ["kerala"],
  "IN.14": ["lakshadweep"],
  "IN.16": ["maharashtra"],
  "IN.17": ["manipur"],
  "IN.18": ["meghalaya"],
  "IN.19": ["karnataka"],
  "IN.20": ["nagaland"],
  "IN.21": ["odisha", "orissa"],
  "IN.22": ["puducherry", "pondicherry"],
  "IN.23": ["punjab"],
  "IN.24": ["rajasthan"],
  "IN.25": ["tamil nadu"],
  "IN.26": ["tripura"],
  "IN.28": ["west bengal"],
  "IN.29": ["sikkim"],
  "IN.30": ["arunachal pradesh"],
  "IN.31": ["mizoram"],
  "IN.33": ["goa"],
  "IN.34": ["bihar"],
  "IN.35": ["madhya pradesh"],
  "IN.36": ["uttar pradesh"],
  "IN.37": ["chhattisgarh"],
  "IN.38": ["jharkhand"],
  "IN.39": ["uttarakhand", "uttaranchal"],
  "IN.40": ["telangana"],
  "IN.41": ["ladakh"],
  "IN.52": ["dadra and nagar haveli and daman and diu", "daman and diu", "dadra and nagar haveli"],

  // United States (GeoNames' codes are the postal ones)
  "US.AK": ["alaska", "ak"],
  "US.AL": ["alabama", "al"],
  "US.AR": ["arkansas", "ar"],
  "US.AZ": ["arizona", "az"],
  "US.CA": ["california", "ca"],
  "US.CO": ["colorado", "co"],
  "US.CT": ["connecticut", "ct"],
  "US.DC": ["district of columbia", "dc"],
  "US.DE": ["delaware", "de"],
  "US.FL": ["florida", "fl"],
  "US.GA": ["georgia", "ga"],
  "US.HI": ["hawaii", "hi"],
  "US.IA": ["iowa", "ia"],
  "US.ID": ["idaho", "id"],
  "US.IL": ["illinois", "il"],
  "US.IN": ["indiana", "in"],
  "US.KS": ["kansas", "ks"],
  "US.KY": ["kentucky", "ky"],
  "US.LA": ["louisiana", "la"],
  "US.MA": ["massachusetts", "ma"],
  "US.MD": ["maryland", "md"],
  "US.ME": ["maine", "me"],
  "US.MI": ["michigan", "mi"],
  "US.MN": ["minnesota", "mn"],
  "US.MO": ["missouri", "mo"],
  "US.MS": ["mississippi", "ms"],
  "US.MT": ["montana", "mt"],
  "US.NC": ["north carolina", "nc"],
  "US.ND": ["north dakota", "nd"],
  "US.NE": ["nebraska", "ne"],
  "US.NH": ["new hampshire", "nh"],
  "US.NJ": ["new jersey", "nj"],
  "US.NM": ["new mexico", "nm"],
  "US.NV": ["nevada", "nv"],
  "US.NY": ["new york", "ny"],
  "US.OH": ["ohio", "oh"],
  "US.OK": ["oklahoma", "ok"],
  "US.OR": ["oregon", "or"],
  "US.PA": ["pennsylvania", "pa"],
  "US.RI": ["rhode island", "ri"],
  "US.SC": ["south carolina", "sc"],
  "US.SD": ["south dakota", "sd"],
  "US.TN": ["tennessee", "tn"],
  "US.TX": ["texas", "tx"],
  "US.UT": ["utah", "ut"],
  "US.VA": ["virginia", "va"],
  "US.VT": ["vermont", "vt"],
  "US.WA": ["washington", "wa"],
  "US.WI": ["wisconsin", "wi"],
  "US.WV": ["west virginia", "wv"],
  "US.WY": ["wyoming", "wy"],
};
