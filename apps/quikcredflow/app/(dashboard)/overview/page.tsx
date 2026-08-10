import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { OverviewClient } from "@/components/overview/overview-client";

function OverviewFallback() {
  return (
    <div className="space-y-4">
      <div className="h-24 animate-pulse rounded-lg bg-crm-panel" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 animate-pulse rounded-lg bg-crm-panel" />
        ))}
      </div>
    </div>
  );
}

export default async function ExecutiveOverviewPage() {
  const session = await requireUser();
  if (!isCrmAdminUser(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-crm-text">Executive overview</h1>
        <p className="mt-1 text-sm text-crm-muted">
          Org-wide visibility — who is doing what, pipeline health, revenue, and team activity.
        </p>
      </header>
      <Suspense fallback={<OverviewFallback />}>
        <OverviewClient />
      </Suspense>
    </div>
  );
}
