import { ListPageSkeleton } from "@/components/page-skeletons";

/** Its own, so the list doesn't borrow the canvas's (app/tree/loading.tsx). */
export default function ReviewLoading() {
  return <ListPageSkeleton label="Loading connections to review…" />;
}
