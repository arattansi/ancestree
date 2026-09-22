import { Skeleton } from "@/components/ui/skeleton";

export default function TreeLoading() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="relative h-[calc(100dvh-3.5rem)] w-full overflow-hidden bg-muted/30">
        <div className="absolute right-4 top-4">
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="flex h-full flex-wrap content-center items-center justify-center gap-6 p-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 w-44 rounded-xl" />
          ))}
        </div>
        <span className="sr-only">Loading the family tree…</span>
      </div>
    </main>
  );
}
