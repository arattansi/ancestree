import { FormPageSkeleton } from "@/components/page-skeletons";

export default function WelcomeLoading() {
  return <FormPageSkeleton label="Loading your entry…" fields={3} />;
}
