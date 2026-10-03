/**
 * Write the sample family (Step 118.1, lib/sample-family.ts) to the hosted
 * project with the service role:
 *
 *   npm run sample:seed            # write it
 *   npm run sample:seed -- --dry-run
 *
 * Needs Node 22+ (supabase-js wants a native WebSocket even unused).
 *
 * Run it after migration `20261003150000_sample_tree`, whose seal lets only
 * the service role write to the sample. Idempotent: every row has a fixed
 * id (relationships one derived from their ends), so running it again after
 * editing the data updates in place; people, relationships, stories,
 * mentions, photos and tags no longer in the data are removed.
 *
 * The tree is held by a system account: created here with a fixed id and an
 * `.invalid` address, banned so nobody signs in as it, and a member of no
 * tree. Its album photos go to `album/{tree}/{photo}.jpg`.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "../lib/database.types";
import {
  SAMPLE_OWNER_EMAIL,
  SAMPLE_OWNER_ID,
  SAMPLE_OWNER_NAME,
  SAMPLE_PEOPLE,
  SAMPLE_PHOTOS,
  SAMPLE_RELATIONSHIPS,
  SAMPLE_STORIES,
  SAMPLE_TREE_ID,
  SAMPLE_TREE_NAME,
  SAMPLE_TREE_SLUG,
} from "../lib/sample-family";

const PHOTOS_DIR = join(dirname(fileURLToPath(import.meta.url)), "sample-tree", "photos");
const DRY = process.argv.includes("--dry-run");
/** A hundred years: as good as for ever. */
const BAN = "876000h";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}
const db = createClient<Database>(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A stable id for a relationship, from its type and ends (UUID v5 layout). */
function relationshipId(type: string, from: string, to: string): string {
  const h = createHash("sha1").update(`ancestree-sample:${type}:${from}:${to}`).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString("hex");
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

function check<T>(what: string, r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(`${what}: ${r.error.message}`);
  return r.data;
}

/** Delete rows of the sample no longer in the data. */
async function prune(
  table: "people" | "relationships" | "stories" | "album_photos",
  keep: string[],
) {
  const rows = check(
    `read ${table}`,
    await db.from(table).select("id").eq("tree_id", SAMPLE_TREE_ID),
  ) as { id: string }[];
  const gone = rows.map((r) => r.id).filter((id) => !keep.includes(id));
  if (gone.length === 0) return;
  console.log(`  removing ${gone.length} ${table} row(s) no longer in the data`);
  if (!DRY) check(`prune ${table}`, await db.from(table).delete().in("id", gone));
}

async function owner() {
  const found = await db.auth.admin.getUserById(SAMPLE_OWNER_ID);
  if (found.data.user) {
    console.log("owner: exists");
  } else {
    console.log("owner: creating");
    if (!DRY) {
      const made = await db.auth.admin.createUser({
        id: SAMPLE_OWNER_ID,
        email: SAMPLE_OWNER_EMAIL,
        email_confirm: false,
        user_metadata: { sample: true },
      });
      if (made.error) throw new Error(`create owner: ${made.error.message}`);
    }
  }
  if (!DRY) {
    const banned = await db.auth.admin.updateUserById(SAMPLE_OWNER_ID, { ban_duration: BAN });
    if (banned.error) throw new Error(`ban owner: ${banned.error.message}`);
    check(
      "profile",
      await db
        .from("profiles")
        .upsert({ auth_user_id: SAMPLE_OWNER_ID, display_name: SAMPLE_OWNER_NAME }),
    );
  }
}

async function main() {
  console.log(DRY ? "Dry run: nothing is written.\n" : "Writing the sample family.\n");
  await owner();

  console.log("tree");
  if (!DRY) {
    check(
      "tree",
      await db.from("trees").upsert({
        id: SAMPLE_TREE_ID,
        name: SAMPLE_TREE_NAME,
        slug: SAMPLE_TREE_SLUG,
        created_by: SAMPLE_OWNER_ID,
        is_sample: true,
      }),
    );
  }

  console.log(`people: ${SAMPLE_PEOPLE.length}`);
  await prune("people", SAMPLE_PEOPLE.map((p) => p.id));
  if (!DRY) {
    check(
      "people",
      await db.from("people").upsert(
        SAMPLE_PEOPLE.map((p) => ({
          id: p.id,
          tree_id: SAMPLE_TREE_ID,
          first_name: p.first_name,
          middle_name: p.middle_name ?? null,
          last_name: p.last_name,
          maiden_name: p.maiden_name ?? null,
          sex: p.sex,
          date_of_birth: p.date_of_birth,
          date_of_birth_precision: p.date_of_birth_precision ?? "day",
          date_of_birth_circa: p.date_of_birth_circa ?? false,
          place_id_birth: p.place_id_birth,
          city_of_birth: p.city_of_birth,
          country_of_birth: p.country_of_birth,
          is_deceased: p.date_of_death != null,
          date_of_death: p.date_of_death ?? null,
          date_of_death_precision: p.date_of_death_precision ?? "day",
          place_id_death: p.place_id_death ?? null,
          place_of_death: p.place_of_death ?? null,
          created_by: SAMPLE_OWNER_ID,
          owner_user_id: SAMPLE_OWNER_ID,
        })),
      ),
    );
  }

  const edges = SAMPLE_RELATIONSHIPS.map((r) => ({
    id: relationshipId(r.type, r.from, r.to),
    tree_id: SAMPLE_TREE_ID,
    from_person: r.from,
    to_person: r.to,
    type: r.type,
    marriage_date: r.type === "spouse" ? r.marriage_date : null,
    created_by: SAMPLE_OWNER_ID,
  }));
  console.log(`relationships: ${edges.length}`);
  await prune("relationships", edges.map((e) => e.id));
  if (!DRY) check("relationships", await db.from("relationships").upsert(edges));

  console.log(`stories: ${SAMPLE_STORIES.length}`);
  await prune("stories", SAMPLE_STORIES.map((s) => s.id));
  if (!DRY) {
    check(
      "stories",
      await db.from("stories").upsert(
        SAMPLE_STORIES.map((s) => ({
          id: s.id,
          person_id: s.person_id,
          tree_id: SAMPLE_TREE_ID,
          created_by: SAMPLE_OWNER_ID,
          title: s.title,
          body: s.body,
          status: "approved",
          decided_at: s.created_at,
          decided_by: SAMPLE_OWNER_ID,
          told_on: s.told_on,
          told_on_precision: s.told_on_precision,
          created_at: s.created_at,
        })),
      ),
    );
    for (const s of SAMPLE_STORIES) {
      check(
        "old mentions",
        await db
          .from("story_mentions")
          .delete()
          .eq("story_id", s.id)
          .not("person_id", "in", `(${s.mentions.join(",")})`),
      );
      check(
        "mentions",
        await db.from("story_mentions").upsert(
          s.mentions.map((person_id) => ({
            story_id: s.id,
            person_id,
            status: "approved",
            decided_at: s.created_at,
            decided_by: SAMPLE_OWNER_ID,
            created_at: s.created_at,
          })),
        ),
      );
    }
  }

  console.log(`album: ${SAMPLE_PHOTOS.length}`);
  await prune("album_photos", SAMPLE_PHOTOS.map((p) => p.id));
  for (const p of SAMPLE_PHOTOS) {
    const path = `${SAMPLE_TREE_ID}/${p.id}.jpg`;
    const bytes = readFileSync(join(PHOTOS_DIR, p.file));
    console.log(`  ${p.file} → album/${path} (${Math.round(bytes.length / 1024)} KB)`);
    if (DRY) continue;
    check(
      `upload ${p.file}`,
      await db.storage.from("album").upload(path, bytes, {
        contentType: "image/jpeg",
        upsert: true,
      }),
    );
    check(
      "photo",
      await db.from("album_photos").upsert({
        id: p.id,
        tree_id: SAMPLE_TREE_ID,
        created_by: SAMPLE_OWNER_ID,
        file_path: path,
        description: p.description,
        taken_on: p.taken_on ?? null,
        taken_on_precision: p.taken_on_precision ?? null,
        created_at: p.created_at,
      }),
    );
    check(
      "old tags",
      await db
        .from("album_tags")
        .delete()
        .eq("photo_id", p.id)
        .not("person_id", "in", `(${p.tags.join(",")})`),
    );
    check(
      "tags",
      await db.from("album_tags").upsert(
        p.tags.map((person_id) => ({
          photo_id: p.id,
          person_id,
          status: "approved",
          decided_at: p.created_at,
          decided_by: SAMPLE_OWNER_ID,
          created_at: p.created_at,
        })),
      ),
    );
  }

  console.log("\nDone.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
