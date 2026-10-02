import "server-only";

import { headers } from "next/headers";

import { countsAsOpen, isCampaignCode, type Campaign } from "@/lib/campaigns";
import type { Database } from "@/lib/database.types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];

export function toCampaign(row: CampaignRow): Campaign {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    placement: row.placement,
    opens: row.opens,
    signups: row.signups,
    treesFounded: row.trees_founded,
    paused: row.paused_at !== null,
    createdAt: row.created_at,
  };
}

/** Every campaign link, newest first, with its counts. Reviewers only. */
export async function listCampaigns(): Promise<Campaign[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_campaigns");
  if (error || !data) return [];
  return data.map(toCampaign);
}

/**
 * Where a campaign link stands as its page opens: taking sign-ups
 * (`open`), `paused`, or no link at all (`null`). The open is counted,
 * unless it's a crawler, a link preview or a prefetch (`countsAsOpen`), or
 * the page drawn again after a server action on it (sending the code sets
 * a cookie, which re-renders it). The service role counts it, since
 * whoever opens it may be signed out; a code that can't be one isn't
 * looked up.
 */
export async function openCampaign(code: string): Promise<"open" | "paused" | null> {
  if (!isCampaignCode(code)) return null;
  const h = await headers();
  const admin = createAdminClient();

  if (
    !h.has("next-action") &&
    countsAsOpen({
      userAgent: h.get("user-agent"),
      purpose: h.get("sec-purpose") ?? h.get("purpose"),
    })
  ) {
    const { data, error } = await admin.rpc("campaign_open", { p_code: code });
    if (error) return null;
    return data === "open" || data === "paused" ? data : null;
  }

  const { data } = await admin
    .from("campaigns")
    .select("paused_at")
    .eq("code", code)
    .maybeSingle();
  if (!data) return null;
  return data.paused_at === null ? "open" : "paused";
}
