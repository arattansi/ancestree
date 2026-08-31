/**
 * One-off importer for the GeoNames dump into `public.places`.
 *
 * Streams the tab-delimited GeoNames export (e.g. `cities500.txt`), keeps only
 * populated places (feature_class 'P') and administrative areas ('A'), and
 * batch-upserts them into `places` keyed on the GeoNames id via the PostgREST
 * REST endpoint (no supabase-js — keeps this runnable on Node 20).
 *
 * Usage (needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in
 * .env.local):
 *
 *   npm run import:geonames -- ~/Downloads/cities500.txt
 *
 * Re-runnable: upsert on `id` (Prefer: resolution=merge-duplicates) is
 * idempotent. See ANCESTREE.md for the source dump version and the free-tier
 * size note.
 */
import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";

const KEPT_FEATURE_CLASSES = new Set(["P", "A"]);
const BATCH_SIZE = 1000;

type PlaceRow = {
  id: number;
  name: string;
  ascii_name: string | null;
  country_code: string | null;
  admin1_code: string | null;
  feature_class: string | null;
  feature_code: string | null;
  latitude: number | null;
  longitude: number | null;
  population: number | null;
};

function text(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function num(value: string | undefined): number | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLine(line: string): PlaceRow | null {
  // GeoNames "geoname" table: 19 tab-separated columns, no header.
  const c = line.split("\t");
  const id = Number(c[0]);
  const featureClass = text(c[6]);
  if (!Number.isFinite(id) || !featureClass || !KEPT_FEATURE_CLASSES.has(featureClass)) {
    return null;
  }
  const name = text(c[1]);
  if (!name) return null;

  return {
    id,
    name,
    ascii_name: text(c[2]),
    latitude: num(c[4]),
    longitude: num(c[5]),
    feature_class: featureClass,
    feature_code: text(c[7]),
    country_code: text(c[8]),
    admin1_code: text(c[10]),
    population: num(c[14]),
  };
}

async function main() {
  const file = process.argv[2] ?? "cities500.txt";
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Run with `--env-file=.env.local` (or `npm run import:geonames`).",
    );
    process.exit(1);
  }

  const endpoint = `${url.replace(/\/$/, "")}/rest/v1/places`;
  const headers = {
    "Content-Type": "application/json",
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    Prefer: "resolution=merge-duplicates,return=minimal",
  };

  console.log(`Importing ${file} -> ${endpoint}`);

  const rl = createInterface({
    input: createReadStream(file, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  let read = 0;
  let kept = 0;
  let written = 0;
  let batch: PlaceRow[] = [];

  const flush = async () => {
    if (batch.length === 0) return;
    const chunk = batch;
    batch = [];
    const res = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(chunk),
    });
    if (!res.ok) {
      console.error(`\nUpsert failed near row ${read} (HTTP ${res.status}):`, await res.text());
      process.exit(1);
    }
    written += chunk.length;
    process.stdout.write(`\r  read ${read}  kept ${kept}  written ${written}`);
  };

  for await (const line of rl) {
    read++;
    if (!line) continue;
    const row = parseLine(line);
    if (!row) continue;
    kept++;
    batch.push(row);
    if (batch.length >= BATCH_SIZE) await flush();
  }
  await flush();

  process.stdout.write("\n");

  const countRes = await fetch(`${endpoint}?select=id`, {
    method: "HEAD",
    headers: { ...headers, Prefer: "count=exact" },
  });
  const total = countRes.headers.get("content-range")?.split("/")[1] ?? "?";

  console.log(
    `Done. Read ${read} lines, kept ${kept} (P/A), upserted ${written}. ` +
      `places now holds ${total} rows.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
