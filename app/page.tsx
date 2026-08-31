import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-5xl" aria-hidden>
          🌳
        </span>
        <div className="flex flex-col items-center gap-1">
          <h1 className="text-4xl font-semibold tracking-tight">ancestree</h1>
          <p className="text-sm font-medium tracking-wide text-foreground [font-variant:small-caps]">
            a space to grow your tree.
          </p>
        </div>
        <div className="flex max-w-md flex-col gap-2 text-lg text-muted-foreground">
          <p>
            Invite-only and collaborative with the people who know best; your
            family.
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button nativeButton={false} render={<Link href="/tree" />} size="lg">
          View the tree
        </Button>
        <Button nativeButton={false} render={<Link href="/join" />} size="lg" variant="outline">
          Have an invite?
        </Button>
      </div>
    </main>
  );
}
