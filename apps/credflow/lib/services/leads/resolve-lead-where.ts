import type { SessionUser } from "@/types/permission";
import { accountScopeFilter } from "@/lib/auth/account-acl";
import { ownerScopeFilter } from "@/lib/auth/owner-scope";
import { translateFilterToPrismaWhere } from "@/lib/services/leads/filter-engine";
import { listCustomFields } from "@/lib/services/fields/repo";
import type { FilterPayloadInput } from "@/lib/validators/lead-filter";

/**
 * Build the Prisma `where` for a user-facing lead query from an advanced-filter
 * payload, applying the SAME guards the /api/leads/filter route uses:
 *   { AND: [ {tenantId}, filterWhere, accountAcl?, ownerScope? ] }
 *
 * Shared so the paginated list and the bulk-update endpoint resolve "the leads
 * matching this filter" IDENTICALLY — a drift or missing ACL/owner-scope clause
 * would let a restricted user bulk-write leads they can't see. The owner-scope
 * fragment AND-merges, so a filter targeting another owner intersects to empty
 * and cannot be used to escape scope.
 *
 * Does NOT apply trash (deletedAt) handling — that is query-specific. The
 * soft-delete middleware injects deletedAt:null for active-only reads unless the
 * caller opts out, so bulk-update (which never sets deletedAt) targets active
 * leads only.
 *
 * SCOPE BOUNDARY: SessionUser-based, USER-FACING actions only. Engine/worker
 * paths operate tenant-wide without a session and must not use this.
 */
export async function resolveLeadWhere(
  user: SessionUser,
  filter: FilterPayloadInput,
): Promise<Record<string, unknown>> {
  const customDefs = await listCustomFields(user.tenantId);
  const filterWhere = translateFilterToPrismaWhere(filter, customDefs);
  const acl = await accountScopeFilter(user);
  const ownerScope = await ownerScopeFilter(user);

  const and: Record<string, unknown>[] = [{ tenantId: user.tenantId }];
  if (Object.keys(filterWhere).length > 0) and.push(filterWhere);
  if (acl) and.push(acl);
  if (ownerScope) and.push(ownerScope);

  return { AND: and };
}