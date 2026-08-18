/**
 * Resolves an MCP tool's `issueId` argument, which may be either the issue's
 * cuid or its human-readable `key` (e.g. "QUIKTR-119") — mirrors
 * `loadProjectAccess`'s id-or-key resolution for `projectId`
 * (lib/api/withProjectAccess.ts), and the same query shape
 * app/(dashboard)/browse/[key]/page.tsx uses to resolve a readable issue URL.
 *
 * `projectId`, if given, scopes the lookup to that project — most callers
 * already know their resolved project by the time they call this. Omit it
 * for a lookup that may legitimately cross projects (e.g. link_issues'
 * inward issue, where cross-project links are intentional).
 */
import { db } from "@/lib/db";

export async function resolveIssueIdOrKey(
  orgId: string,
  idOrKey: string,
  projectId?: string,
): Promise<{ id: string; projectId: string } | null> {
  return db.qtIssue.findFirst({
    where: {
      orgId,
      isDeleted: false,
      ...(projectId ? { projectId } : {}),
      OR: [{ id: idOrKey }, { key: idOrKey.toUpperCase() }],
    },
    select: { id: true, projectId: true },
  });
}
