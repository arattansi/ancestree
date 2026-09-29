import { ListPageSkeleton } from "@/components/page-skeletons";

export default function TreesLoading() {
  return (
    <ListPageSkeleton label="Loading your trees…" width="lg" rows={2} />
  );
}
