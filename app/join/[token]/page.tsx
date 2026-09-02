import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MagicLinkForm } from "@/components/magic-link-form";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "accept invite",
  description: "Join your family tree on ancestree.",
};

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Already a member — nothing to redeem.
  const profile = await getProfile();
  if (profile) redirect("/tree");

  const supabase = await createClient();
  const { data } = await supabase.rpc("invite_preview", { p_token: token });
  const preview = data?.[0];

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        {preview?.valid ? (
          <>
            <CardHeader>
              <CardTitle>You&rsquo;re invited</CardTitle>
              <CardDescription>
                <span className="font-medium text-foreground">
                  {preview.inviter_name}
                </span>{" "}
                invited you to help build{" "}
                <span className="font-medium text-foreground">
                  {preview.tree_name}
                </span>
                . Enter your email to get a sign-in link — opening it accepts the
                invite.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MagicLinkForm inviteToken={token} submitLabel="Accept &amp; sign in" />
              <p className="mt-4 text-xs text-muted-foreground">
                By joining you agree to share your family details with other
                members of this private tree.
              </p>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Invite not available</CardTitle>
              <CardDescription>
                This invite link is invalid, has already been used, or has
                expired. Ask the relative who invited you for a fresh link.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                <Link href="/" className="underline underline-offset-4">
                  Back home
                </Link>
              </p>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
