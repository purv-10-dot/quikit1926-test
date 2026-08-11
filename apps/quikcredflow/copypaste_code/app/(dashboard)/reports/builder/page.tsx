import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { ReportBuilder } from "@/components/reports/report-builder";

export default async function ReportsBuilderPage() {
  const user = await requireUser();
  const memberships = await prisma.orgMember.findMany({
    where: { orgId: user.tenantId },
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
          Loading builder…
        </div>
      }
    >
      <ReportBuilder ownerOptions={ownerOptions} />
    </Suspense>
  );
}
