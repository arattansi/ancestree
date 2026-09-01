import "server-only";

import { groupNicknames, type NicknameGroup } from "@/lib/nicknames";
import { createClient } from "@/lib/supabase/server";

/** Every nickname group, alphabetical by root. Readable by any member. */
export async function listNicknameGroups(): Promise<NicknameGroup[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("name_nicknames")
    .select("variant, canonical")
    .order("canonical", { ascending: true });
  return groupNicknames(data ?? []);
}
