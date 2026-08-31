/**
 * Step 4.5b — one-off backfill of people.place_id_birth / place_id_death from
 * the legacy free-text columns (city_of_birth + country_of_birth, place_of_death).
 *
 * For each person it fuzzy-matches the free text against `places` (trigram-style
 * similarity, filtered by country where the country name resolves to an ISO
 * code). A confident match (>= THRESHOLD) sets the FK; anything else is left
 * NULL and written to a CSV for manual review. The old text columns are NOT
 * touched — dropping them is a separate follow-up.
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local):
 *
 *   npm run backfill:places
 *
 * Writes scripts/out/backfill-places-unmatched.csv.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COUNTRY_NAME_TO_ISO } from "./lib/country-codes";

const THRESHOLD = 0.6;
const OUT = join(dirname(fileURLToPath(import.meta.url)), "out", "backfill-places-unmatched.csv");

type Place = {
  id: number;
  name: string;
  ascii_name: string | null;
  admin1_code: string | null;
  country_code: string | null;
  population: number | null;
  search_name: string | null;
};

type Person = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  city_of_birth: string | null;
  country_of_birth: string | null;
  place_of_death: string | null;
};

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use `npm run backfill:places`).");
  process.exit(1);
}
const rest = `${url.replace(/\/$/, "")}/rest/v1`;
const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** pg_trgm-style trigram set: each word padded with two leading + one trailing space. */
function trigrams(s: string): Set<string> {
  const out = new Set<string>();
  for (const word of normalize(s).split(" ").filter(Boolean)) {
    const p = `  ${word} `;
    for (let i = 0; i < p.length - 2; i++) out.add(p.slice(i, i + 3));
  }
  return out;
}

function similarity(a: string, b: string): number {
  const ta = trigrams(a);
  const tb = trigrams(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return (2 * inter) / (ta.size + tb.size);
}

function isoFor(country: string | null): string | null {
  if (!country) return null;
  const t = country.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return COUNTRY_NAME_TO_ISO[normalize(t)] ?? null;
}

async function candidates(city: string, iso: string | null): Promise<Place[]> {
  const first = normalize(city).split(" ")[0];
  if (!first) return [];
  const params = new URLSearchParams({
    select: "id,name,ascii_name,admin1_code,country_code,population,search_name",
    search_name: `ilike.*${first}*`,
    order: "population.desc.nullslast",
    limit: "100",
  });
  if (iso) params.set("country_code", `eq.${iso}`);
  const res = await fetch(`${rest}/places?${params}`, { headers });
  if (!res.ok) {
    console.error(`places query failed (${res.status}) for "${city}":`, await res.text());
    return [];
  }
  return (await res.json()) as Place[];
}

async function bestMatch(freeText: string, iso: string | null) {
  let pool = await candidates(freeText, iso);
  // If a country filter found nothing, retry unfiltered (country text may be
  // unrecognised or wrong) but demand a higher bar via the caller's threshold.
  if (pool.length === 0 && iso) pool = await candidates(freeText, null);

  let best: { place: Place; score: number } | null = null;
  for (const place of pool) {
    const score = similarity(freeText, place.search_name ?? place.ascii_name ?? place.name);
    if (!best || score > best.score) best = { place, score };
  }
  return best;
}

function csvCell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

async function main() {
  const res = await fetch(
    `${rest}/people?select=id,first_name,last_name,city_of_birth,country_of_birth,place_of_death`,
    { headers },
  );
  if (!res.ok) {
    console.error(`people query failed (${res.status}):`, await res.text());
    process.exit(1);
  }
  const people = (await res.json()) as Person[];

  let birthMatched = 0;
  let deathMatched = 0;
  const unmatched: string[][] = [];

  for (const p of people) {
    const name = [p.first_name, p.last_name].filter(Boolean).join(" ") || p.id;
    const patch: Record<string, number> = {};

    if (p.city_of_birth?.trim()) {
      const iso = isoFor(p.country_of_birth);
      const m = await bestMatch(p.city_of_birth, iso);
      const label = `${p.city_of_birth}${p.country_of_birth ? `, ${p.country_of_birth}` : ""}`;
      if (m && m.score >= THRESHOLD) {
        patch.place_id_birth = m.place.id;
        birthMatched++;
        console.log(`  birth  ${name}: "${label}" -> ${m.place.name} [${m.place.country_code}] (${m.score.toFixed(2)})`);
      } else {
        unmatched.push([p.id, name, "birth", label, m ? `${m.place.name} (${m.score.toFixed(2)})` : "no candidates"]);
      }
    }

    if (p.place_of_death?.trim()) {
      const m = await bestMatch(p.place_of_death, null);
      if (m && m.score >= THRESHOLD) {
        patch.place_id_death = m.place.id;
        deathMatched++;
        console.log(`  death  ${name}: "${p.place_of_death}" -> ${m.place.name} [${m.place.country_code}] (${m.score.toFixed(2)})`);
      } else {
        unmatched.push([p.id, name, "death", p.place_of_death, m ? `${m.place.name} (${m.score.toFixed(2)})` : "no candidates"]);
      }
    }

    if (Object.keys(patch).length > 0) {
      const upd = await fetch(`${rest}/people?id=eq.${p.id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify(patch),
      });
      if (!upd.ok) {
        console.error(`  update failed for ${name} (${upd.status}):`, await upd.text());
        process.exit(1);
      }
    }
  }

  mkdirSync(dirname(OUT), { recursive: true });
  const rows = [
    ["person_id", "name", "field", "original_text", "closest_candidate"],
    ...unmatched,
  ];
  writeFileSync(OUT, rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");

  console.log(
    `\nDone. ${people.length} people scanned. ` +
      `Birth matched: ${birthMatched}. Death matched: ${deathMatched}. ` +
      `Needs review: ${unmatched.length} -> ${OUT}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
