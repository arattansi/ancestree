import { Skeleton } from "@/components/ui/skeleton";

export default function AccountLoading() {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <span className="sr-only">Loading your account…</span>
    </main>
  );
}
