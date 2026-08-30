import { Skeleton } from "@/components/ui/skeleton";

export default function AdminLoading() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <Skeleton className="h-8 w-32" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <span className="sr-only">Loading the admin dashboard…</span>
    </main>
  );
}
