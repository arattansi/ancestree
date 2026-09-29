import { FormPageSkeleton } from "@/components/page-skeletons";

/** Its own, so the form doesn't borrow the trees list's (app/trees/loading.tsx). */
export default function NewTreeLoading() {
  return <FormPageSkeleton label="Loading…" width="lg" fields={1} />;
}
