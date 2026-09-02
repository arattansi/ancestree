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
import { getProfile, getUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "join",
  description: "ancestree is invite-only. Sign in with a family invite link.",
};

export default async function JoinPage({
  searchParams,
}: PageProps<"/join">) {
  const { status, error } = await searchParams;

  const profile = await getProfile();
  if (profile) redirect("/tree");

  const user = await getUser();
  const pending = status === "pending" || Boolean(user);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{pending ? "Almost there" : "Sign in to ancestree"}</CardTitle>
          <CardDescription>
            {pending
              ? "Your email is verified, but it is not linked to a family invite yet. Ask the relative who invited you to send you their invite link, then open it on this device."
              : "ancestree is a private family tree. Enter your email and we will send you a one-time sign-in link."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error === "invite" ? (
            <p
              role="alert"
              className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
            >
              That invite link is invalid, already used, or expired.
            </p>
          ) : null}

          {pending ? (
            <p className="text-sm text-muted-foreground">
              Have an invite link? Open it directly — it will sign you in and add
              you to the tree.
            </p>
          ) : (
            <MagicLinkForm />
          )}

          <p className="text-sm text-muted-foreground">
            <Link href="/" className="underline underline-offset-4">
              Back home
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
