import type { Metadata } from "next";
import Link from "next/link";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "sign-in link problem",
};

export default function AuthCodeErrorPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>That link didn&rsquo;t work</CardTitle>
          <CardDescription>
            Sign-in links expire after an hour and work once. Sign in with a
            code instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <Link href="/join" className="underline underline-offset-4">
              Get a sign-in code
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
