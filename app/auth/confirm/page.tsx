import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { confirmSignIn } from "@/app/actions/auth";
import { SubmitButton } from "@/components/submit-button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "finish signing in",
  robots: { index: false },
};

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Where the link in a sign-in email lands. The one-time token is only spent
 * when the button is pressed: mail scanners open every link in a message, and
 * if opening it signed someone in, the recipient's own click would find the
 * link already used. So the page can't yet say the email is confirmed, and
 * the link may be someone's first, so no "Welcome back" (Step 30.4).
 */
export default async function ConfirmSignInPage({
  searchParams,
}: PageProps<"/auth/confirm">) {
  const params = await searchParams;
  const tokenHash = one(params.token_hash);
  const type = one(params.type);
  const invite = one(params.invite);
  const next = one(params.next);

  if (!tokenHash || !type) redirect("/auth/auth-code-error");

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{invite ? "Join the Family Tree" : "Finish Signing In"}</CardTitle>
          <CardDescription>One more tap and you&rsquo;re in.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={confirmSignIn} className="flex flex-col">
            <input type="hidden" name="tokenHash" value={tokenHash} />
            <input type="hidden" name="type" value={type} />
            <input type="hidden" name="invite" value={invite} />
            <input type="hidden" name="next" value={next} />
            <SubmitButton pendingLabel="Signing in…">
              {invite ? "Accept & open the tree" : "Sign in to ancestree"}
            </SubmitButton>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
