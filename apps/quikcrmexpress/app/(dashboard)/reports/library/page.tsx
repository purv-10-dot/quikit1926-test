import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { hasPermission } from "@/lib/auth/require-permission";
import { prisma } from "@/lib/db/prisma";
import { ReportsHub } from "@/components/reports/reports-hub";

export default async function ReportsLibraryPage() {
  const user = await requireUser();
  const canExport = await hasPermission(user, "reports", "export");
  const memberships = await prisma.orgMember.findMany({
    where: { orgId: user.orgId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  const ownerOptions = memberships
    .map((m) => ({
      value: m.user.id,
      label:
        `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() ||
        m.user.email ||
        m.user.id,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  return (
    <Suspense
      fallback={
        <div className="rounded border border-dashed border-crm-border p-6 text-center text-sm text-crm-muted">
          Loading reports…
        </div>
      }
    >
      <ReportsHub ownerOptions={ownerOptions} canExport={canExport} />
    </Suspense>
  );
}
