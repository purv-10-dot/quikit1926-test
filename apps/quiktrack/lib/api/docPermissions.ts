import { hasAdminAccess, userCanInProject } from "@/lib/api/permissions";
import type { Action } from "@/lib/api/permissionsRegistry";

/**
 * Doc permission gate shared by the single-doc routes and the doc-folder
 * routes: global admins (tenant/app) bypass; everyone else is gated by their
 * custom project role (Doc:view / Doc:update / Doc:delete).
 */
export async function canDoc(
  userId: string,
  orgId: string,
  projectId: string,
  action: Action,
): Promise<boolean> {
  if (await hasAdminAccess(userId, orgId)) return true;
  return userCanInProject(userId, orgId, projectId, "Doc", action);
}
