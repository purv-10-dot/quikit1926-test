import { Suspense } from "react";
import { CallDispositionsPage } from "@/components/settings/call-dispositions-page";

export default function Page() {
  return (
    <Suspense fallback={<p className="text-sm text-crm-muted">Loading…</p>}>
      <CallDispositionsPage />
    </Suspense>
  );
}
