import { NextResponse } from "next/server";

import { getProfile } from "@/lib/auth";
import { loadMessenger } from "@/lib/messenger.server";

/**
 * `GET /api/messages`: the messenger pop-up's conversations and the people
 * the reader can write to (Step 174), read when the pop-up wakes and again
 * when a message comes from someone it hasn't listed. The messages
 * themselves the pop-up reads and sends through the database directly.
 */
export async function GET() {
  const profile = await getProfile();
  if (!profile) {
    return NextResponse.json({ error: "Sign in to see this." }, { status: 401 });
  }
  try {
    return NextResponse.json(await loadMessenger(), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("[api/messages] couldn't read the messenger", error);
    return NextResponse.json(
      { error: "Couldn't load your messages." },
      { status: 500 },
    );
  }
}
