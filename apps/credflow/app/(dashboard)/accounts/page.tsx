/**
 * Server Component shell for /accounts. Owns the auth guard + permission
 * lookup, then hands rendering to the client AccountsExplorer.
 *
 * Data fetching itself is client-side (so search / pagination / tab switches
 * don't need a full page navigation). Server only resolves "what can this
 * user do" so the explorer can disable buttons without an extra round-trip.
 */
import { requireUser } from "@/lib/auth/require";
import { getEffectiveMatrix } from "@/lib/auth/permissions";
import { AccountsExplorer } from "@/components/accounts/accounts-explorer";

const ADMIN_ROLE = "Administrator";

export default async function AccountsPage() {
  const user = await requireUser();
  const isAdmin = user.role === ADMIN_ROLE;
  let canCreate = isAdmin;
  let canEdit = isAdmin;
  let canDelete = isAdmin;
  if (!isAdmin) {
    const matrix = await getEffectiveMatrix(user.userId, user.tenantId, user.role);
    const row = matrix.find((r) => r.module === "accounts");
    canCreate = !!row?.actions.includes("create");
    canEdit = !!row?.actions.includes("edit");
    canDelete = !!row?.actions.includes("delete");
  }

  return (
    <AccountsExplorer
      canCreate={canCreate}
      canEdit={canEdit}
      canDelete={canDelete}
      isAdmin={isAdmin}
    />
  );
}
