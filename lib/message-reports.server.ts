import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * A message reported in the messenger (Step 177.3), as a Root of a tree the
 * two share or a beta reviewer sees it: the words as the reporter's device
 * read them (messages are encrypted on members' devices, so the server
 * can't check them), and nothing else of the conversation. Never shown to
 * the member reported (`message_reports` RLS).
 */
export type MessageReport = {
  id: string;
  body: string;
  /** Why, in the reporter's words, if they said. */
  reason: string | null;
  sentAt: string;
  createdAt: string;
  reporterName: string;
  senderName: string;
  /** Its sender has deleted the message since; the report keeps its words. */
  deleted: boolean;
};

const COLUMNS = "id, body, reason, sent_at, created_at, reporter_id, sender_id, message_id";

type Row = {
  id: string;
  body: string;
  reason: string | null;
  sent_at: string;
  created_at: string;
  reporter_id: string;
  sender_id: string;
  message_id: string | null;
};

/**
 * The two members' names on reports the viewer was already allowed to read
 * (RLS chose the rows): a reviewer may share no tree with them, so the
 * names come with the service role, for these ids only.
 */
async function withNames(rows: readonly Row[]): Promise<MessageReport[]> {
  if (rows.length === 0) return [];
  const ids = [...new Set(rows.flatMap((r) => [r.reporter_id, r.sender_id]))];
  const { data } = await createAdminClient()
    .from("profiles")
    .select("auth_user_id, display_name")
    .in("auth_user_id", ids);
  const names = new Map(
    (data ?? []).map((p) => [p.auth_user_id, p.display_name?.trim() || null]),
  );
  return rows.map((r) => ({
    id: r.id,
    body: r.body,
    reason: r.reason,
    sentAt: r.sent_at,
    createdAt: r.created_at,
    reporterName: names.get(r.reporter_id) || "A relative",
    senderName: names.get(r.sender_id) || "A relative",
    deleted: r.message_id === null,
  }));
}

/** The open reports between members of a tree, for its Root console, oldest first. */
export async function listTreeMessageReports(treeId: string): Promise<MessageReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_reports")
    .select(COLUMNS)
    .contains("tree_ids", [treeId])
    .eq("status", "open")
    .order("created_at", { ascending: true });
  return withNames(data ?? []);
}

/** How many wait on a tree: the Root console's queue counts them with reports. */
export async function countTreeMessageReports(treeId: string): Promise<number> {
  const supabase = await createClient();
  const { count } = await supabase
    .from("message_reports")
    .select("id", { count: "exact", head: true })
    .contains("tree_ids", [treeId])
    .eq("status", "open");
  return count ?? 0;
}

/** Every open report, for the beta reviewers' admin page, oldest first. */
export async function listOpenMessageReports(): Promise<MessageReport[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("message_reports")
    .select(COLUMNS)
    .eq("status", "open")
    .order("created_at", { ascending: true });
  return withNames(data ?? []);
}
