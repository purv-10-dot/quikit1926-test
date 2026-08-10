import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { ExportButton } from "@/components/reports/export-button";
import { ActivitiesListClient } from "@/components/activities/activities-list-client";

const ADMIN_ROLE = "Administrator";

export default async function ActivitiesPage() {
  const user = await requireUser();
  const isAdmin = user.role === ADMIN_ROLE;
  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;
  let canViewLeads = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId, user.role);
    const row = matrix.find((r) => r.module === "activities");
    canCreate = !!row?.actions.includes("create");
    canEdit = !!row?.actions.includes("edit");
    canDelete = !!row?.actions.includes("delete");
    const leadsRow = matrix.find((r) => r.module === "leads");
    canViewLeads = !!leadsRow?.actions.includes("view");
  }

  return (
    <PageContainer size="full">
      <PageHeader
        title="Activities"
        subtitle="Unified timeline of calls, emails, meetings, and stage changes"
        actions={<ExportButton apiPath="/api/activities" size="md" />}
      />
      <ActivitiesListClient
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
        canViewLeads={canViewLeads}
      />
    </PageContainer>
  );
}
