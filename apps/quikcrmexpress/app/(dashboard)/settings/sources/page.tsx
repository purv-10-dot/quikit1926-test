import { Suspense } from "react";
import { LeadSourcesPage } from "@/components/settings/lead-sources-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-crm-muted">Loading…</p>}>
      <LeadSourcesPage />
    </Suspense>
  );
}
