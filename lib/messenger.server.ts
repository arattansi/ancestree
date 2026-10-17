import "server-only";

import { getProfile } from "@/lib/auth";
import type { ConnectionRelationship } from "@/lib/connection-path";
import { signedCardPhotoUrls } from "@/lib/entry-view.server";
import type { MessengerData, MessengerRelation } from "@/lib/messenger";
import { memberRelation, type RelationPerson } from "@/lib/messenger-relation";
import { familyTies } from "@/lib/my-family";
import { personDisplayName } from "@/lib/person-name";
import { createClient } from "@/lib/supabase/server";
import { readPaged } from "@/lib/tree";
import { listMyTrees } from "@/lib/tree-context";
import { myFamilyFocusHref, treeFocusHref } from "@/lib/tree-links";

type Db = Awaited<ReturnType<typeof createClient>>;

/**
 * Who each member the reader can see in the messenger is to them (Step
 * 177.1), by account, over the people and lines the reader's own trees
 * show them (RLS chooses which), so a chain never runs through an entry
 * they can't see. Read only when the pop-up is open (`relations`), not to
 * count the badge. Nothing for a reader with no entry of their own, or
 * for a member whose entry they can't see.
 */
async function loadRelations(
  supabase: Db,
  targets: readonly { userId: string; personId: string | null }[],
): Promise<Record<string, MessengerRelation>> {
  // Once each: someone you've written to is usually a contact too.
  const wanted = [
    ...new Map(
      targets.flatMap((t) => (t.personId ? [[t.userId, { userId: t.userId, personId: t.personId }] as const] : [])),
    ).values(),
  ];
  if (wanted.length === 0) return {};
  const [profile, trees] = await Promise.all([getProfile(), listMyTrees()]);
  const selfId = profile?.self_person_id;
  if (!selfId || trees.length === 0) return {};
  const treeIds = trees.map((t) => t.id);
  const [people, edges] = await Promise.all([
    readPaged((from, to) =>
      supabase
        .from("tree_people")
        .select("id, first_name, preferred_name, last_name, placeholder_number, sex, photo_path, photo_crop, blurred")
        .in("tree_id", treeIds)
        .order("tree_id")
        .order("id")
        .range(from, to),
    ),
    readPaged((from, to) =>
      supabase
        .from("tree_edges")
        .select("id, from_person, to_person, type, is_divorced")
        .in("tree_id", treeIds)
        .order("tree_id")
        .order("id")
        .range(from, to),
    ),
  ]);
  // Half a family would name the wrong relation: say nothing instead.
  if (people.failed || edges.failed) return {};

  const persons = new Map<
    string,
    RelationPerson & { photo_path: string | null; photo_crop: unknown }
  >();
  for (const p of people.rows) {
    if (!p.id || p.blurred || persons.has(p.id)) continue;
    persons.set(p.id, {
      // The name they go by, as a chain says it: "her sister Nadia".
      name:
        p.placeholder_number == null
          ? (p.preferred_name || p.first_name || personDisplayName(p)).trim()
          : personDisplayName(p),
      sex: p.sex,
      photo_path: p.photo_path,
      photo_crop: p.photo_crop,
    });
  }
  // A line is a fact across trees: each tree's copy of it is the same line.
  const lines = new Map<string, ConnectionRelationship>();
  for (const e of edges.rows) {
    if (!e.from_person || !e.to_person || !e.type) continue;
    if (!persons.has(e.from_person) || !persons.has(e.to_person)) continue;
    lines.set(`${e.from_person}:${e.to_person}:${e.type}`, {
      from_person: e.from_person,
      to_person: e.to_person,
      type: e.type,
      is_divorced: e.is_divorced ?? false,
    });
  }
  const relationships = [...lines.values()];
  // My Family Tree lights the connection when it shows them; else the
  // canvas opens on them.
  const ties = familyTies(
    selfId,
    relationships.map((r) => ({ ...r, is_divorced: !!r.is_divorced })),
  );

  const found = wanted.flatMap((t) => {
    const relation = memberRelation(selfId, t.personId, persons, relationships);
    return relation ? [{ ...t, relation }] : [];
  });
  const faceOf = await signedCardPhotoUrls(
    supabase,
    found.flatMap((f) =>
      f.relation.chain.map((link) => {
        const p = persons.get(link.personId);
        return { photo_path: p?.photo_path ?? null, photo_crop: p?.photo_crop ?? null };
      }),
    ),
  );
  return Object.fromEntries(
    found.map(({ userId, personId, relation }) => [
      userId,
      {
        ...relation,
        chain: relation.chain.map((link) => {
          const p = persons.get(link.personId);
          return {
            ...link,
            name: p?.name ?? "",
            photoUrl: faceOf({ photo_path: p?.photo_path ?? null, photo_crop: p?.photo_crop ?? null }),
            photoCrop: p?.photo_crop ?? null,
          };
        }),
        href: ties.has(personId) ? myFamilyFocusHref(personId) : treeFocusHref(personId),
      },
    ]),
  );
}

/**
 * The reader's conversations and everyone they can write to (Step 174),
 * as the messenger pop-up shows them: faces as card-sized photos, signed
 * for this reader, so a face they may not see never gets an address. The
 * last messages come encrypted, for the device to read (Step 174.6). With
 * `relations`, who each of them is to the reader (Step 177.1).
 */
export async function loadMessenger({
  relations = false,
}: { relations?: boolean } = {}): Promise<MessengerData> {
  const supabase = await createClient();
  const [conversations, contacts] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase.rpc("message_contacts"),
  ]);
  if (conversations.error) throw conversations.error;
  if (contacts.error) throw contacts.error;
  const relationOf = relations
    ? await loadRelations(supabase, [
        ...(conversations.data ?? []).map((c) => ({
          userId: c.other_user_id,
          personId: c.other_person_id,
        })),
        ...(contacts.data ?? []).map((c) => ({ userId: c.user_id, personId: c.person_id })),
      ])
    : null;

  const faces = [
    ...(conversations.data ?? []).map((c) => ({
      photo_path: c.other_photo_path,
      photo_crop: c.other_photo_crop,
    })),
    ...(contacts.data ?? []).map((c) => ({
      photo_path: c.photo_path,
      photo_crop: c.photo_crop,
    })),
  ];
  const cardUrlOf = await signedCardPhotoUrls(supabase, faces);

  return {
    conversations: (conversations.data ?? []).map((c) => ({
      id: c.conversation_id,
      otherUserId: c.other_user_id,
      name: c.other_name,
      personId: c.other_person_id,
      photoUrl: cardUrlOf({
        photo_path: c.other_photo_path,
        photo_crop: c.other_photo_crop,
      }),
      photoCrop: c.other_photo_crop,
      otherKeyVersion: c.other_key_version,
      waiting: c.waiting ?? 0,
      incomingWaiting: c.incoming_waiting ?? 0,
      // Read on the device (Step 174.6): the server has only ciphertext.
      last:
        c.last_id && c.last_ciphertext && c.last_nonce && c.last_signature
          ? {
              id: c.last_id,
              conversation_id: c.conversation_id,
              sender_id: c.last_sender_id,
              // Written then; it reached the reader at `last_at` (Step 182).
              created_at: c.last_created_at ?? c.last_at,
              ciphertext: c.last_ciphertext,
              nonce: c.last_nonce,
              signature: c.last_signature,
              sender_key_version: c.last_sender_key_version,
              key_version: c.last_key_version,
              sealed_key: c.last_sealed_key,
              sealed_at: c.last_at,
              waiting: false,
            }
          : null,
      lastBody: null,
      lastSenderId: c.last_sender_id,
      lastAt: c.last_at,
      lastReadAt: c.last_read_at,
      unread: c.unread,
      canSend: c.can_send,
      mutedUntil: c.muted_until,
      blocked: c.blocked === "by_you" || c.blocked === "by_them" ? c.blocked : null,
    })),
    contacts: (contacts.data ?? []).map((c) => ({
      userId: c.user_id,
      name: c.name,
      personId: c.person_id,
      photoUrl: cardUrlOf({ photo_path: c.photo_path, photo_crop: c.photo_crop }),
      photoCrop: c.photo_crop,
      trees: c.tree_names ?? [],
      keyVersion: c.key_version,
    })),
    relations: relationOf,
  };
}
