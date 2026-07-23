import { Suspense } from "react";
import { requireUser } from "@/lib/auth/require";
import { assertModule, getEffectiveMatrix } from "@/lib/auth/permissions";
import { LogActivityPage } from "@/components/activities/log-activity-page";

const ADMIN_ROLE = "Administrator";

export const dynamic = "force-dynamic";

/**
 * Dedicated "Log activity" page — replaces the old centred <LogActivityModal>.
 *
 * Server-gated on the same permission the modal's triggers checked
 * (activities:create); a direct hit without it 403s via assertModule. Record
 * context is passed through the URL (see LogActivityPage). The `canViewLeads`
 * flag is retained for API compatibility with the composer.
 */
export default async function LogActivityRoute() {
  const user = await requireUser();
  await assertModule(user, "activities", "create");

  const isAdmin = user.role === ADMIN_ROLE;
  let canViewLeads = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.orgId);
    if (matrix.length === 0) {
      canViewLeads = true;
    } else {
      const leadsRow = matrix.find((r) => r.module === "leads");
      canViewLeads = !!leadsRow?.actions.includes("view");
    }
  }

  return (
    <Suspense fallback={null}>
      <LogActivityPage canViewLeads={canViewLeads} />
    </Suspense>
  );
}
