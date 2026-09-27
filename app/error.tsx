"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * What a page shows when something on it fails (Step 61), in place of
 * Next's bare error page: the header stays, with a way to try again or back
 * to the tree. The reference matches the server's log of it.
 */
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-24">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Something Went Wrong</CardTitle>
          <CardDescription>This page couldn&rsquo;t load.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => retry()}>Try again</Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href="/tree" />}
            >
              Back to tree
            </Button>
          </div>
          {error.digest ? (
            <p className="text-xs text-muted-foreground">
              Reference {error.digest}
            </p>
          ) : null}
        </CardContent>
      </Card>
    </main>
  );
}
