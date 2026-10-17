/**
 * Make, or make again, the account Apple's reviewers sign in with on the
 * phone (Step 176), and the invented family it opens on.
 *
 *   npm run review:account
 *
 * prints the account's new password once: paste it, with the address, into
 * App Store Connect → ancestree → App Review Information. Nothing else keeps
 * it. `APP_REVIEW_PASSWORD=… npm run review:account` sets one you chose.
 *
 *   npm run review:account -- --off
 *
 * gives the account a new password nobody is told, so it no longer signs
 * in. Run it plain again to turn it back on.
 *
 * Each run starts over: every tree the two review accounts run is deleted
 * (refused if anyone else is on it), then the reviewer founds the Kapadia
 * family's tree again (nine invented people, one story, no photos) with
 * themselves on it, and the steward, who never signs in, joins as its second
 * Root. So App Review may change anything, or delete the account (the tree
 * passes to the steward); the next run puts it back. Both accounts' newsletter
 * and getting-started emails are off. It goes through the same RPCs a founder's
 * first run does, as the reviewer; the service role only makes the accounts,
 * their profiles, the steward's membership and their settings.
 */
import { randomBytes } from "node:crypto";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { APP_REVIEW_EMAIL, APP_REVIEW_STEWARD_EMAIL } from "../lib/app-review";
import type { Database, Json } from "../lib/database.types";

type Db = SupabaseClient<Database>;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !anonKey || !serviceKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY must be set (.env.local).",
  );
}

const NO_SESSION = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const admin: Db = createClient<Database>(url, serviceKey, { auth: NO_SESSION });
const fresh = (): Db => createClient<Database>(url, anonKey, { auth: NO_SESSION });

const TREE_NAME = "Kapadia family";

/** A password long enough that guessing it is hopeless, base64url. */
const newPassword = () => randomBytes(24).toString("base64url");

function fail(what: string, error: { message: string } | null | undefined): never {
  throw new Error(`${what}: ${error?.message ?? "no answer"}`);
}

async function findUser(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail("Couldn't list accounts", error);
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}

/** The account's id, made if it isn't there, with `password` if given. */
async function ensureUser(email: string, password: string | null): Promise<string> {
  const existing = await findUser(email);
  if (existing) {
    if (password) {
      const { error } = await admin.auth.admin.updateUserById(existing.id, {
        password,
        email_confirm: true,
        ban_duration: "none",
      });
      if (error) fail(`Couldn't set ${email}'s password`, error);
    }
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    ...(password ? { password } : {}),
  });
  if (error || !data.user) fail(`Couldn't make ${email}`, error);
  return data.user.id;
}

/** Their profile, as accepting an invite would make it, and the emails off. */
async function ensureProfile(userId: string, displayName: string) {
  const { data: profile } = await admin
    .from("profiles")
    .select("auth_user_id")
    .eq("auth_user_id", userId)
    .maybeSingle();
  if (!profile) {
    const { error } = await admin
      .from("profiles")
      .insert({ auth_user_id: userId, display_name: displayName });
    if (error) fail("Couldn't make a profile", error);
  }
  const off = { user_id: userId, subscribed: false };
  const results = await Promise.all([
    admin.from("newsletter_settings").upsert(off, { onConflict: "user_id" }),
    admin.from("onboarding_settings").upsert(off, { onConflict: "user_id" }),
  ]);
  const failed = results.find((r) => r.error)?.error;
  if (failed) fail("Couldn't turn their emails off", failed);
}

/** A client signed in as the steward, who has no password: a magic link's token. */
async function signInByLink(email: string): Promise<Db> {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !data.properties?.hashed_token) fail(`Couldn't sign ${email} in`, error);
  const db = fresh();
  const { error: verify } = await db.auth.verifyOtp({
    type: "email",
    token_hash: data.properties.hashed_token,
  });
  if (verify) fail(`Couldn't sign ${email} in`, verify);
  return db;
}

async function signInWithPassword(email: string, password: string): Promise<Db> {
  const db = fresh();
  const { error } = await db.auth.signInWithPassword({ email, password });
  if (error) fail(`The new password didn't sign ${email} in`, error);
  return db;
}

/**
 * Delete every tree `member` runs, as their Root, and the files on it,
 * refusing one anyone but the two review accounts is on.
 */
async function deleteTreesOf(member: Db, reviewIds: readonly string[]) {
  const { data: trees, error } = await member.from("my_trees").select("id, name, role");
  if (error) fail("Couldn't read their trees", error);
  for (const tree of trees ?? []) {
    if (tree.role !== "admin" || !tree.id) continue;
    const { data: members } = await admin
      .from("tree_members")
      .select("user_id")
      .eq("tree_id", tree.id);
    if ((members ?? []).some((m) => !reviewIds.includes(m.user_id))) {
      throw new Error(
        `Someone else is on "${tree.name}", which a review account runs. Nothing was deleted; take them off it first.`,
      );
    }
    const { data: people } = await admin
      .from("people")
      .select("id, photo_path")
      .eq("tree_id", tree.id);
    const ids = (people ?? []).map((p) => p.id);
    const { data: stories } = ids.length
      ? await admin.from("stories").select("audio_path").in("person_id", ids)
      : { data: [] };
    const { error: gone } = await member.rpc("delete_tree", { p_tree: tree.id });
    if (gone) fail(`Couldn't delete "${tree.name}"`, gone);

    const photos = (people ?? []).flatMap((p) => (p.photo_path ? [p.photo_path] : []));
    const recordings = (stories ?? []).flatMap((s) => (s.audio_path ? [s.audio_path] : []));
    if (photos.length) await admin.storage.from("photos").remove(photos);
    if (recordings.length) await admin.storage.from("stories").remove(recordings);
    console.log(`Deleted "${tree.name}".`);
  }
}

type Born = { year: number; month?: number; day?: number };

function person(p: {
  first: string;
  last: string;
  maiden?: string;
  born: Born;
  city: string;
  country: string;
  died?: { year: number; place: string };
}) {
  const { year, month, day } = p.born;
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    first_name: p.first,
    middle_name: "",
    preferred_name: "",
    maiden_name: p.maiden ?? "",
    last_name: p.last,
    country_of_birth: p.country,
    city_of_birth: p.city,
    date_of_birth: `${year}-${pad(month ?? 1)}-${pad(day ?? 1)}`,
    date_of_birth_precision: month && day ? "day" : "year",
    birth_month: null,
    birth_day: null,
    is_deceased: !!p.died,
    date_of_death: p.died ? `${p.died.year}-01-01` : "",
    date_of_death_precision: p.died ? "year" : "day",
    place_of_death: p.died?.place ?? "",
    adult: true,
  };
}

/**
 * The Kapadia family, every name and date invented: Porbandar to Mombasa,
 * then Toronto and Leicester. The reviewer is Asha, first.
 */
const FAMILY = [
  { sex: "female", row: person({ first: "Asha", last: "Mehta", born: { year: 1990, month: 4, day: 12 }, city: "Toronto", country: "Canada" }) },
  { sex: "male", row: person({ first: "Rohan", last: "Mehta", born: { year: 1993 }, city: "Toronto", country: "Canada" }) },
  { sex: "female", row: person({ first: "Nila", last: "Mehta", maiden: "Kapadia", born: { year: 1961 }, city: "Mombasa", country: "Kenya" }) },
  { sex: "male", row: person({ first: "Kiran", last: "Mehta", born: { year: 1957 }, city: "Nairobi", country: "Kenya" }) },
  { sex: "male", row: person({ first: "Ramnik", last: "Kapadia", born: { year: 1931 }, city: "Porbandar", country: "India", died: { year: 2004, place: "Toronto, Canada" } }) },
  { sex: "female", row: person({ first: "Savita", last: "Kapadia", maiden: "Shah", born: { year: 1935 }, city: "Mombasa", country: "Kenya", died: { year: 2019, place: "Toronto, Canada" } }) },
  { sex: "male", row: person({ first: "Hasmukh", last: "Kapadia", born: { year: 1958 }, city: "Mombasa", country: "Kenya" }) },
  { sex: "female", row: person({ first: "Priya", last: "Kapadia", born: { year: 1962 }, city: "Leicester", country: "United Kingdom" }) },
  { sex: "male", row: person({ first: "Dev", last: "Kapadia", born: { year: 1988 }, city: "Leicester", country: "United Kingdom" }) },
];
const [ASHA, ROHAN, NILA, KIRAN, RAMNIK, SAVITA, HASMUKH, PRIYA, DEV] = FAMILY.keys();

const parent = (a: number, b: number) => ({ type: "parent", a: `new:${a}`, b: `new:${b}` });
const spouse = (a: number, b: number, married: number) => ({
  type: "spouse",
  a: `new:${a}`,
  b: `new:${b}`,
  marriage_date: `${married}-01-01`,
  marriage_month: null,
  marriage_day: null,
  is_divorced: false,
  divorce_date: "",
});

const EDGES = [
  parent(NILA, ASHA), parent(KIRAN, ASHA), parent(NILA, ROHAN), parent(KIRAN, ROHAN),
  parent(RAMNIK, NILA), parent(SAVITA, NILA), parent(RAMNIK, HASMUKH), parent(SAVITA, HASMUKH),
  parent(HASMUKH, DEV), parent(PRIYA, DEV),
  spouse(RAMNIK, SAVITA, 1956), spouse(KIRAN, NILA, 1987), spouse(HASMUKH, PRIYA, 1986),
];

const STORY = {
  title: "The tin trunk",
  body: [
    "Ramnik left Porbandar at nineteen with a tin trunk and his mother’s address book. In Mombasa he swept the floor of his uncle’s cloth shop until he could run it, and that is where he met Savita, buying thread for her sister’s wedding.",
    "In 1974 they packed the trunk again, for Toronto. It still had PORBANDAR chalked on the lid. He kept it under the stairs, full of letters, and never let anyone wipe the chalk off.",
  ].join("\n\n"),
};

async function build(reviewer: Db, stewardId: string) {
  const { data: tree, error } = await reviewer.rpc("found_tree", { p_name: TREE_NAME });
  if (error || !tree) fail("Couldn't found the tree", error);

  const { data: added, error: addError } = await reviewer.rpc("add_people_with_connections", {
    p_people: FAMILY.map((p) => p.row) as Json,
    p_edges: EDGES as Json,
    p_self_index: ASHA,
    p_tree: tree.id,
  });
  if (addError || !added) fail("Couldn't add the family", addError);
  const ids = (added as { ids: string[] }).ids;

  // What the call doesn't take, set after it as the web's add form does.
  for (const [i, id] of ids.entries()) {
    const { error: sexError } = await admin.from("people").update({ sex: FAMILY[i].sex }).eq("id", id);
    if (sexError) fail("Couldn't set who's who", sexError);
  }

  const { error: storyError } = await reviewer.rpc("add_story", {
    p_person: ids[RAMNIK],
    p_tree: tree.id,
    p_title: STORY.title,
    p_body: STORY.body,
    p_told_on: "2015-06-01",
    p_told_precision: "year",
    p_storytellers: [ids[SAVITA]],
  });
  if (storyError) fail("Couldn't tell the story", storyError);

  const { error: joinError } = await admin
    .from("tree_members")
    .insert({ tree_id: tree.id, user_id: stewardId, role: "admin" });
  if (joinError) fail("Couldn't make the steward a Root", joinError);

  return tree;
}

async function main() {
  const off = process.argv.includes("--off");
  const chosen = process.env.APP_REVIEW_PASSWORD?.trim() || null;
  const password = off ? newPassword() : chosen ?? newPassword();

  if (off) {
    if (!(await findUser(APP_REVIEW_EMAIL))) {
      console.log(`There's no ${APP_REVIEW_EMAIL} account to turn off.`);
      return;
    }
    await ensureUser(APP_REVIEW_EMAIL, password);
    console.log(`${APP_REVIEW_EMAIL} has a new password nobody knows: it no longer signs in.`);
    return;
  }
  const reviewerId = await ensureUser(APP_REVIEW_EMAIL, password);
  const stewardId = await ensureUser(APP_REVIEW_STEWARD_EMAIL, null);
  await ensureProfile(reviewerId, "Asha Mehta");
  await ensureProfile(stewardId, "ancestree");

  const reviewer = await signInWithPassword(APP_REVIEW_EMAIL, password);
  const steward = await signInByLink(APP_REVIEW_STEWARD_EMAIL);
  const reviewIds = [reviewerId, stewardId];
  await deleteTreesOf(reviewer, reviewIds);
  await deleteTreesOf(steward, reviewIds);

  const tree = await build(reviewer, stewardId);
  await Promise.all([reviewer.auth.signOut(), steward.auth.signOut()]);

  console.log(`"${tree.name}" is ready, with ${FAMILY.length} people and a story.`);
  console.log(`Sign in on the phone as ${APP_REVIEW_EMAIL}.`);
  if (!chosen) console.log(`Password (shown once, for App Store Connect): ${password}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
