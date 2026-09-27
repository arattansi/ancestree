import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "not found",
};

/**
 * A page that isn't there (Step 61), such as an entry on another of the
 * member's trees: the tree they're looking at is the one the browser
 * remembers, so a link from another tab can point off it.
 */
export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page Not Found</CardTitle>
          <CardDescription>
            It doesn&rsquo;t exist, or it&rsquo;s on another of your trees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href="/tree" />}>
            Back to tree
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
