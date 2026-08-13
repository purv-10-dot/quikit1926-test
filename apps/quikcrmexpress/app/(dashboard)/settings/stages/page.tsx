import { Suspense } from "react";
import { LeadStagesPage } from "@/components/settings/lead-stages-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-crm-muted">Loading…</p>}>
      <LeadStagesPage />
    </Suspense>
  );
}
