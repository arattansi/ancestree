import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Join · Ancestree",
  description: "Ancestree is invite-only. Use a family invite link to join.",
};

export default function JoinPage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Invite only</CardTitle>
          <CardDescription>
            Ancestree is a private family tree. You need an invite link from a
            relative to create an account.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Magic-link sign-in lands in a later step. If you already have an
          invite, keep that URL — it will bring you here when auth is wired.
        </CardContent>
        <CardFooter>
          <Button render={<Link href="/" />}>
            Back home
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
