import Link from "next/link";

import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-24 text-center">
      <div className="flex flex-col items-center gap-4">
        <span className="text-5xl" aria-hidden>
          🌳
        </span>
        <h1 className="text-4xl font-semibold tracking-tight">Ancestree</h1>
        <p className="max-w-md text-lg text-muted-foreground">
          Build your family tree together. Invite-only, collaborative, and
          verified by the people who know best — your family.
        </p>
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
