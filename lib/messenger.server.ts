import "server-only";

import { signedCardPhotoUrls } from "@/lib/entry-view.server";
import type { MessengerData } from "@/lib/messenger";
import { createClient } from "@/lib/supabase/server";

/**
 * The reader's conversations and everyone they can write to (Step 174),
 * as the messenger pop-up shows them: faces as card-sized photos, signed
 * for this reader, so a face they may not see never gets an address. The
 * last messages come encrypted, for the device to read (Step 174.6).
 */
export async function loadMessenger(): Promise<MessengerData> {
  const supabase = await createClient();
  const [conversations, contacts] = await Promise.all([
    supabase.rpc("my_conversations"),
    supabase.rpc("message_contacts"),
  ]);
  if (conversations.error) throw conversations.error;
  if (contacts.error) throw contacts.error;

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
      // Read on the device (Step 174.6): the server has only ciphertext.
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
  };
}
