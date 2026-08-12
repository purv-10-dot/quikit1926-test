import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { hasPermission } from "@/lib/auth/require-permission";
import { PageHeader } from "@/components/shared/page-header";
import { PageContainer } from "@/components/ui/container";
import { getUpworkStats } from "@/lib/services/upwork/upwork-service";
import { upworkOwnerScope } from "@/lib/services/upwork/resolve-upwork-user";
import { UpworkListClient } from "@/components/upwork/upwork-list-client";

const ADMIN_ROLE = "Administrator";

/**
 * Upwork — jobs captured from Upwork by the QuikCRM browser extension.
 *
 * Server-side guard so a user without `upwork.view` gets a route-level redirect
 * rather than a page that immediately renders an API 403 (same pattern as
 * /icp). Write capabilities are resolved here and passed down as props.
 *
 * Non-admins see only the jobs they captured; the stats respect the same scope,
 * so the count above the table always matches the rows in it.
 */
export default async function UpworkPage() {
  const user = await requireUser();
  if (!(await hasPermission(user, "upwork", "view"))) redirect("/");

  const isAdmin = user.role === ADMIN_ROLE;
  let canEdit = isAdmin;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId);
    // Backwards-compat: an empty matrix means "unrestricted" elsewhere in this
    // app (see assertModule's legacy-template fallback), so mirror that here.
    if (matrix.length === 0) {
      canEdit = canDelete = true;
    } else {
      const row = matrix.find((r) => r.module === "upwork");
      canEdit = !!row?.actions.includes("edit");
      canDelete = !!row?.actions.includes("delete");
    }
  }

  const stats = await getUpworkStats(user.orgId, upworkOwnerScope(user));

  return (
    <PageContainer size="wide">
      <PageHeader
        title="Upwork"
        subtitle="Jobs captured from Upwork with the QuikCRM browser extension. Records stay in this module — they are not leads, prospects or opportunities."
      />
      <UpworkListClient
        initialStats={stats}
        canEdit={canEdit}
        canDelete={canDelete}
        isAdmin={isAdmin}
      />
    </PageContainer>
  );
}
