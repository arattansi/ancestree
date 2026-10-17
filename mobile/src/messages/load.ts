import type { MessengerData } from "@/lib/messenger";
import { supabase } from "@/auth/supabase";

/**
 * The member's conversations and everyone they can write to (Step 179.1),
 * read straight from the database with the RPCs the web's `/api/messages`
 * calls (`loadMessenger` in `lib/messenger.server.ts`), as the member. The
 * last messages come encrypted, for the phone to read. Faces are initials
 * here, as everywhere on the phone so far; who each of them is to the
 * member is worked out on the phone from the family it already holds
 * (`useRelations`), so `relations` stays null.
 */
export async function loadMessenger(): Promise<MessengerData> {
  const [conversations, contacts] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase.rpc("message_contacts"),
  ]);
  if (conversations.error) throw conversations.error;
  if (contacts.error) throw contacts.error;
  return {
    conversations: (conversations.data ?? []).map((c) => ({
      id: c.conversation_id,
      otherUserId: c.other_user_id,
      name: c.other_name,
      personId: c.other_person_id,
      photoUrl: null,
      photoCrop: c.other_photo_crop,
      otherKeyVersion: c.other_key_version,
      last:
        c.last_id && c.last_ciphertext && c.last_nonce && c.last_signature
          ? {
              id: c.last_id,
              conversation_id: c.conversation_id,
              sender_id: c.last_sender_id,
              created_at: c.last_at,
              ciphertext: c.last_ciphertext,
              nonce: c.last_nonce,
              signature: c.last_signature,
              sender_key_version: c.last_sender_key_version,
              key_version: c.last_key_version,
              sealed_key: c.last_sealed_key,
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
      photoUrl: null,
      photoCrop: c.photo_crop,
      trees: c.tree_names ?? [],
      keyVersion: c.key_version,
    })),
    relations: null,
  };
}
