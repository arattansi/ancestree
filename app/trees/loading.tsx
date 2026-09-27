import { ListPageSkeleton } from "@/components/page-skeletons";

export default function TreesLoading() {
  return (
    <ListPageSkeleton label="Loading your trees…" width="max-w-lg" rows={2} />
  );
}
