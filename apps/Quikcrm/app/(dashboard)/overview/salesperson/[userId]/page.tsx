import { Suspense } from "react";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { isCrmAdminUser } from "@/lib/auth/is-crm-admin";
import { SalespersonDetailClient } from "@/components/overview/salesperson-detail-client";

function DetailSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-28 rounded-xl bg-crm-panel" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-crm-panel" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-60 rounded-xl bg-crm-panel" />
        <div className="h-60 rounded-xl bg-crm-panel" />
      </div>
    </div>
  );
}

export default async function SalespersonDetailPage({
  params,
}: {
  params: { userId: string };
}) {
  const session = await requireUser();
  if (!isCrmAdminUser(session)) {
    redirect("/dashboard");
  }

  return (
    <div className="space-y-6">
      <Suspense fallback={<DetailSkeleton />}>
        <SalespersonDetailClient userId={params.userId} />
      </Suspense>
    </div>
  );
}
