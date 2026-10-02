import type { Metadata } from "next";
import Link from "next/link";

import { CenteredPage } from "@/components/page-column";
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
    <CenteredPage>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Page Not Found</CardTitle>
          <CardDescription>
            It doesn&rsquo;t exist, or it&rsquo;s on another of your trees.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button nativeButton={false} render={<Link href="/tree" />}>
            back to tree
          </Button>
        </CardContent>
      </Card>
    </CenteredPage>
  );
}
