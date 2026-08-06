import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { computeIcpStats } from "@/lib/services/icp/icp-service";
import { IcpListClient } from "@/components/icp/icp-list-client";

const ADMIN_ROLE = "Administrator";

/**
 * ICP (Ideal Customer Profile) — org-level master list.
 *
 * Server-side guard so a user without `icp.view` gets a route-level redirect
 * rather than a page that immediately renders an API 403 (same pattern as the
 * dashboard page). Write capabilities are resolved here and passed down as
 * props, matching the accounts / price-lists pages.
 */
export default async function IcpPage() {
  const user = await requireUser();
  if (!(await hasPermission(user, "icp", "view"))) redirect("/");

  const isAdmin = user.role === ADMIN_ROLE;
  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId);
    // Backwards-compat: an empty matrix means "unrestricted" elsewhere in this
    // app (see assertModule's legacy-template fallback), so mirror that here.
    if (matrix.length === 0) {
      canCreate = canEdit = canDelete = true;
    } else {
      const row = matrix.find((r) => r.module === "icp");
      canCreate = !!row?.actions.includes("create");
      canEdit = !!row?.actions.includes("edit");
      canDelete = !!row?.actions.includes("delete");
    }
  }

  const stats = await computeIcpStats(user.orgId);

  return (
    <PageContainer size="wide">
      <PageHeader
        title="ICP"
        subtitle="Ideal Customer Profiles — who you sell to, what you sell them, and the industries, verticals and technologies that define the fit."
      />
      <IcpListClient
        initialStats={stats}
        canCreate={canCreate}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </PageContainer>
  );
}
