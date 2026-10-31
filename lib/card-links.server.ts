import "server-only";

import { randomBytes } from "node:crypto";

import { checkBotId } from "botid/server";
import { cookies } from "next/headers";
import type * as React from "react";

import { type CardSignatureView } from "@/lib/birthday-cards";
import {
  asCardLinkView,
  asksHowTheyKnow,
  asPageSignature,
  CARD_SECRET_COOKIE,
  CARD_SECRET_MAX_AGE,
  isCardSecret,
  type CardLinkMine,
} from "@/lib/card-links";
import { getSessionUser } from "@/lib/auth";
import { signedCardPhotoUrls } from "@/lib/entry-view.server";
import { cropStyle, parseCrop } from "@/lib/image-crop";
import { inviteUrl } from "@/lib/invite-mint.server";
import type { LeafShape } from "@/lib/leaf-shapes";
import { nativeLeaf } from "@/lib/native-leaf";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * An argument the database takes as null, which the generated types call
 * required: left `undefined`, supabase-js would drop it and the call would
 * miss its function.
 */
export function sqlNull<T>(value: T | null | undefined): T {
  return (value ?? null) as T;
}

/** How long a signature's file links last on the link's page. */
const FILE_LINK_SECONDS = 60 * 60;

/** The browser's secret for cards' links, if it has one (a page can't set it). */
export async function readCardSecret(): Promise<string | null> {
  const value = (await cookies()).get(CARD_SECRET_COOKIE)?.value;
  return isCardSecret(value) ? value : null;
}

/**
 * The browser's secret, made on its first call from a route handler: a
 * random 32 bytes, httpOnly, sent to every page (the link's page reads it,
 * the routes under /api/cards use it).
 */
export async function cardSecretForRoute(): Promise<string> {
  const store = await cookies();
  const value = store.get(CARD_SECRET_COOKIE)?.value;
  if (isCardSecret(value)) return value;
  const made = randomBytes(32).toString("base64url");
  store.set(CARD_SECRET_COOKIE, made, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: CARD_SECRET_MAX_AGE,
  });
  return made;
}

/** Who's asking, signed in, or null. */
export async function cardViewer(): Promise<string | null> {
  return (await getSessionUser())?.id ?? null;
}

/**
 * Vercel BotID on a signed-out write (Step 217.3): false only when it says
 * a bot sent it. It runs on Vercel alone (in development it answers human);
 * if it can't run (no OIDC token, its service down) the request goes on, and
 * the caps in the database still hold.
 */
export async function notABot(): Promise<boolean> {
  try {
    const verdict = await checkBotId();
    return !verdict.isBot;
  } catch (error) {
    console.error("[cards] BotID couldn't check the request", error);
    return true;
  }
}

/** What the link's page draws: only this leaves the server. */
export type CardLinkPage =
  | { state: "gone" }
  | { state: "peek"; firstName: string; opensOn: string }
  | {
      state: "live";
      token: string;
      kind: "public" | "personal";
      firstName: string;
      sex: string | null;
      opensOn: string;
      isOpen: boolean;
      signing: boolean;
      /** The person died: the card won't open (Step 217.5). */
      closed: boolean;
      collector: string;
      leaf: LeafShape;
      photo: { url: string; style: React.CSSProperties } | null;
      /** Signed in: as the trees name them. */
      viewerName: string | null;
      /** Signed in: their account's address, to fill in Ask to join. */
      viewerEmail: string | null;
      /** A personal link: the relative's name, to sign with. */
      personalName: string | null;
      /** Ask "how do you know them?" */
      asksHow: boolean;
      /** A personal link, signed: where they claim their entry. */
      claimUrl: string | null;
      mine: (CardLinkMine & { audioUrl: string | null; photoUrl: string | null }) | null;
      /** The person's thank-you, once it reached the viewer (Step 217.5). */
      thanks: string | null;
      joinable: boolean;
      signatures: CardSignatureView[] | null;
    };

/**
 * The link's page for whoever opened it: the database answers by the token,
 * the signed-in account and the browser's secret (`card_link_view`, for the
 * service role alone); files are linked here, the person's photo framed as
 * their card frames it, their leaf drawn from their birthplace. Null for a
 * token that opens nothing.
 */
export async function loadCardLinkPage(token: string): Promise<CardLinkPage | null> {
  const [user, secret] = await Promise.all([getSessionUser(), readCardSecret()]);
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("card_link_view", {
    p_token: token,
    p_viewer: user?.id ?? undefined,
    p_secret: secret ?? undefined,
  });
  if (error) throw new Error("Couldn’t read the card.");
  const view = asCardLinkView(data);
  if (!view) return null;
  if (view.state !== "live") return view;

  const files = [
    ...(view.signatures ?? []).flatMap((s) => [s.audioPath, s.photoPath]),
    view.mine?.audioPath,
    view.mine?.photoPath,
  ].filter((p): p is string => !!p);
  const links = new Map<string, string>();
  if (files.length > 0) {
    const { data: signed } = await admin.storage
      .from("cards")
      .createSignedUrls([...new Set(files)], FILE_LINK_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) links.set(s.path, s.signedUrl);
    }
  }

  const photoRow = { photo_path: view.photoPath, photo_crop: view.photoCrop };
  const photoUrl = view.photoPath ? (await signedCardPhotoUrls(admin, [photoRow]))(photoRow) : null;

  return {
    state: "live",
    token,
    kind: view.kind,
    firstName: view.firstName,
    sex: view.sex,
    opensOn: view.opensOn,
    isOpen: view.isOpen,
    signing: view.signing,
    closed: view.closed,
    collector: view.collector,
    leaf: nativeLeaf({
      city_of_birth: view.birthplace?.city,
      country_of_birth: view.birthplace?.country,
    }).shape,
    photo: photoUrl ? { url: photoUrl, style: cropStyle(parseCrop(view.photoCrop)) } : null,
    viewerName: view.viewerName,
    viewerEmail: user?.email ?? null,
    personalName: view.personal?.name || null,
    asksHow: asksHowTheyKnow(view),
    claimUrl: view.claimToken ? inviteUrl(view.claimToken) : null,
    mine: view.mine
      ? {
          ...view.mine,
          audioUrl: view.mine.audioPath ? (links.get(view.mine.audioPath) ?? null) : null,
          photoUrl: view.mine.photoPath ? (links.get(view.mine.photoPath) ?? null) : null,
        }
      : null,
    thanks: view.thanks,
    joinable: view.joinable,
    signatures: view.signatures ? view.signatures.map((s) => asPageSignature(s, links)) : null,
  };
}
