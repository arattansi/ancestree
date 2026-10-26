import "server-only";

import type { Profile, SessionUser } from "@/lib/auth";
import {
  dateStem,
  extensionOf,
  fileNamer,
  profileCsvRows,
  storyMarkdown,
  toCsv,
  type FamilyRelation,
  type ProfileExport,
} from "@/lib/data-export";
import { placeLabels, signedPhotoUrl } from "@/lib/entry-view.server";
import { firstDegree } from "@/lib/first-degree";
import { shownEmail } from "@/lib/no-email";
import { asDayMonth, formatPartialDate } from "@/lib/partial-date";
import { SEX_LABELS, type Sex } from "@/lib/person-labels";
import { personDisplayName } from "@/lib/person-name";
import { asCredits, creditGroups } from "@/lib/story-credits";
import { createClient } from "@/lib/supabase/server";
import type { MyTree } from "@/lib/tree-context";

/**
 * What settings' **export data** saves (Step 207), read as the member, so
 * the rows and files are the ones they may see already and nothing more.
 */

/** How long the files' links last: long enough to fetch a big album. */
const EXPORT_LINK_SECONDS = 30 * 60;

/** "download profile data (.csv)": their account, settings, trees, entry and family. */
export async function profileCsv(
  profile: Profile,
  user: SessionUser,
  trees: MyTree[],
): Promise<string> {
  const supabase = await createClient();
  const selfId = profile.self_person_id;
  const [{ data: newsletter }, { data: gettingStarted }, entry] = await Promise.all([
    // No row yet means on, as settings reads them.
    supabase
      .from("newsletter_settings")
      .select("subscribed")
      .eq("user_id", profile.auth_user_id)
      .maybeSingle(),
    supabase
      .from("onboarding_settings")
      .select("subscribed")
      .eq("user_id", profile.auth_user_id)
      .maybeSingle(),
    selfId ? ownEntry(selfId, trees) : null,
  ]);
  const email = shownEmail(user.email);

  const data: ProfileExport = {
    account: {
      name: profile.display_name,
      email,
      memberSince: profile.created_at,
    },
    settings: {
      newsletter: newsletter?.subscribed ?? true,
      gettingStarted: gettingStarted?.subscribed ?? true,
      relativesCanAsk: email === "No email" ? null : profile.relatives_can_ask,
    },
    trees: trees.map((t) => ({
      name: t.name,
      type: t.type.name,
      joinedAt: t.joinedAt,
      founded: t.founded,
    })),
    entry: entry?.details ?? null,
    family: entry?.family ?? [],
  };
  return toCsv(profileCsvRows(data));
}

/** Their entry's details and the relatives a line away, or null when it can't be read. */
async function ownEntry(
  personId: string,
  trees: MyTree[],
): Promise<{
  details: NonNullable<ProfileExport["entry"]>;
  family: ProfileExport["family"];
} | null> {
  const supabase = await createClient();
  // Members can't read an entry's email from `people` (Step 156): the
  // owner's own comes from `owned_entry_email`.
  const [{ data: person }, { data: email }, { data: lines }] = await Promise.all([
    supabase
      .from("people")
      .select(
        "id, tree_id, first_name, middle_name, preferred_name, maiden_name, last_name, sex, date_of_birth, date_of_birth_precision, date_of_birth_circa, birth_month, birth_day, place_id_birth, city_of_birth, is_deceased, date_of_death, date_of_death_precision, date_of_death_circa, place_id_death, place_of_death, place_id_residence, place_of_residence, email_visible, hidden_from_visitors, photo_path",
      )
      .eq("id", personId)
      .maybeSingle(),
    supabase.rpc("owned_entry_email", { p_person: personId }),
    supabase
      .from("relationships")
      .select("type, from_person, to_person, is_divorced")
      .or(`from_person.eq.${personId},to_person.eq.${personId}`),
  ]);
  if (!person) return null;

  const own = lines ?? [];
  const parents = own
    .filter((r) => r.type === "parent" && r.to_person === personId)
    .map((r) => r.from_person);
  const storedSiblings = own
    .filter((r) => r.type === "sibling")
    .map((r) => (r.from_person === personId ? r.to_person : r.from_person));
  // Siblings come by a shared parent, or by stored rows (`firstDegree`), so
  // the parents' children and the siblings' own sibling rows are read too.
  const [{ data: parentsLines }, { data: siblingsLines }, labels, homeTree] =
    await Promise.all([
      parents.length
        ? supabase
            .from("relationships")
            .select("type, from_person, to_person, is_divorced")
            .eq("type", "parent")
            .in("from_person", parents)
        : { data: [] },
      storedSiblings.length
        ? supabase
            .from("relationships")
            .select("type, from_person, to_person, is_divorced")
            .eq("type", "sibling")
            .or(
              `from_person.in.(${storedSiblings.join(",")}),to_person.in.(${storedSiblings.join(",")})`,
            )
        : { data: [] },
      placeLabels(person),
      homeTreeName(person.tree_id, trees),
    ]);
  const relationships = [...own, ...(parentsLines ?? []), ...(siblingsLines ?? [])];
  const near = firstDegree(personId, relationships);
  const divorced = new Set(
    own
      .filter((r) => r.type === "spouse" && r.is_divorced)
      .map((r) => (r.from_person === personId ? r.to_person : r.from_person)),
  );

  const ids = [...near.parents, ...near.spouses, ...near.children, ...near.siblings];
  const { data: relatives } = ids.length
    ? await supabase
        .from("people")
        .select("id, first_name, preferred_name, last_name, placeholder_number")
        .in("id", ids)
    : { data: [] };
  const nameOf = new Map((relatives ?? []).map((p) => [p.id, personDisplayName(p)]));
  const family: ProfileExport["family"] = [];
  const add = (relation: FamilyRelation, people: string[]) => {
    for (const id of people) {
      // Someone they can't see isn't named.
      const name = nameOf.get(id);
      if (name) family.push({ relation, name });
    }
  };
  add("Parent", near.parents);
  add("Partner", near.spouses.filter((id) => !divorced.has(id)));
  add("Former partner", near.spouses.filter((id) => divorced.has(id)));
  add("Child", near.children);
  add("Sibling", near.siblings);

  const died = person.is_deceased || !!person.date_of_death;
  return {
    details: {
      homeTree,
      firstName: person.first_name,
      middleName: person.middle_name,
      preferredName: person.preferred_name,
      maidenName: person.maiden_name,
      lastName: person.last_name,
      sex: person.sex ? (SEX_LABELS[person.sex as Sex] ?? person.sex) : null,
      born: formatPartialDate(
        person.date_of_birth,
        person.date_of_birth_precision,
        asDayMonth(person.birth_month, person.birth_day),
        person.date_of_birth_circa,
      ),
      birthplace: labels.birth,
      livesIn: died ? null : labels.residence,
      died,
      deathDate: formatPartialDate(
        person.date_of_death,
        person.date_of_death_precision,
        null,
        person.date_of_death_circa,
      ),
      deathPlace: labels.death,
      email: email || null,
      emailShown: person.email_visible,
      hiddenFromVisitors: person.hidden_from_visitors,
      hasPhoto: !!person.photo_path,
    },
    family,
  };
}

/** The entry's home tree's name: one of theirs, or read when it isn't. */
async function homeTreeName(treeId: string, trees: MyTree[]): Promise<string | null> {
  const mine = trees.find((t) => t.id === treeId);
  if (mine) return mine.name;
  const supabase = await createClient();
  const { data } = await supabase.from("trees").select("name").eq("id", treeId).maybeSingle();
  return data?.name ?? null;
}

/** A file the browser fetches into the archive, by its signed link. */
export type MediaFile = { name: string; url: string };
/** A file the server writes out whole: a written story, the index. */
export type MediaText = { name: string; text: string };

/**
 * "download tagged media (.zip)": what's tagged with their own entry, each
 * kind in its folder: their photo and the album photos they're in under
 * `images/`, the stories about them as their recordings under `audio/` and
 * their words under `documents/` (Markdown, as they're kept), and
 * `media.csv` saying what each file is. Whatever they declined is left
 * out; what still waits for their answer is in, and says so. Files are
 * signed here and fetched by the browser, so no function holds a whole
 * album.
 */
export async function taggedMedia(
  profile: Profile,
): Promise<{ files: MediaFile[]; texts: MediaText[] }> {
  const personId = profile.self_person_id;
  if (!personId) return { files: [], texts: [] };
  const supabase = await createClient();

  const [{ data: person }, album, stories] = await Promise.all([
    supabase.from("people").select("photo_path").eq("id", personId).maybeSingle(),
    supabase.rpc("entry_album", { p_person: personId }),
    supabase.rpc("entry_stories", { p_person: personId }),
  ]);
  if (album.error || stories.error) throw new Error("Couldn’t read what you’re tagged in.");
  const photos = (album.data ?? []).filter((p) => p.status !== "declined");
  const told = (stories.data ?? []).filter((s) => s.status !== "declined");

  const recordings = told.flatMap((s) => (s.audio_path ? [s.audio_path] : []));
  const [portrait, photoLinks, audioLinks] = await Promise.all([
    signedPhotoUrl(supabase, person?.photo_path),
    signedLinks("album", photos.map((p) => p.file_path)),
    signedLinks("stories", recordings),
  ]);

  const nameFile = fileNamer();
  const files: MediaFile[] = [];
  const texts: MediaText[] = [];
  const index: string[][] = [
    ["File", "Kind", "Title or description", "Date", "Added by", "With", "Credits", "Your answer"],
  ];
  const answer = (status: string) => (status === "approved" ? "Yes" : "Waiting for you");

  if (portrait && person?.photo_path) {
    const name = nameFile("images", ["portrait"], "portrait", extensionOf(person.photo_path, "jpg"));
    files.push({ name, url: portrait });
    index.push([name, "Your photo", "", "", "", "", "", ""]);
  }

  for (const p of photos) {
    const url = photoLinks.get(p.file_path);
    if (!url) continue;
    const name = nameFile(
      "images",
      [dateStem(p.taken_on, p.taken_on_precision), p.description],
      "photo",
      extensionOf(p.file_path, "jpg"),
    );
    files.push({ name, url });
    index.push([
      name,
      "Photo",
      p.description ?? "",
      formatPartialDate(p.taken_on, p.taken_on_precision) ?? "",
      p.added_by || "A relative",
      namesIn(p.others, personId),
      "",
      answer(p.status),
    ]);
  }

  for (const s of told) {
    const date = dateStem(s.told_on, s.told_on_precision);
    const credits = asCredits(s.credits);
    const creditLine = creditGroups(credits)
      .map((g) => `${g.label}: ${g.people.map((c) => c.name).join(", ")}`)
      .join("; ");
    const row = (name: string, kind: string) => [
      name,
      kind,
      s.title ?? "",
      formatPartialDate(s.told_on, s.told_on_precision) ?? "",
      s.told_by || "A relative",
      namesIn(s.about, personId),
      creditLine,
      answer(s.status),
    ];

    const url = s.audio_path ? audioLinks.get(s.audio_path) : undefined;
    if (s.audio_path && url) {
      const name = nameFile("audio", [date, s.title], "recording", extensionOf(s.audio_path, "webm"));
      files.push({ name, url });
      index.push(row(name, "Recording"));
    }
    if (s.body?.trim()) {
      const name = nameFile("documents", [date, s.title], "story", "md");
      texts.push({
        name,
        text: storyMarkdown({
          title: s.title,
          body: s.body,
          toldBy: s.told_by || "A relative",
          toldOn: s.told_on,
          toldPrecision: s.told_on_precision,
          createdAt: s.created_at,
          credits,
          about: namesOf(s.about),
        }),
      });
      index.push(row(name, "Written story"));
    }
  }

  if (files.length === 0 && texts.length === 0) return { files, texts };
  texts.push({ name: "media.csv", text: toCsv(index) });
  return { files, texts };
}

/** Signed links to a bucket's files, by path, as the member may read them. */
async function signedLinks(
  bucket: "album" | "stories",
  paths: string[],
): Promise<Map<string, string>> {
  const links = new Map<string, string>();
  if (paths.length === 0) return links;
  const supabase = await createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls(paths, EXPORT_LINK_SECONDS);
  for (const s of data ?? []) {
    if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
  }
  return links;
}

/** The names in a row's `others` or `about` (`jsonb`), as the trees name them. */
function namesOf(value: unknown, leaving?: string): string[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((p) =>
    p && typeof p === "object" && typeof p.id === "string" && p.id !== leaving
      ? [typeof p.name === "string" && p.name ? p.name : "A relative"]
      : [],
  );
}

/** Everyone else in a photo or a story, for the index. */
function namesIn(value: unknown, self: string): string {
  return namesOf(value, self).join(", ");
}
