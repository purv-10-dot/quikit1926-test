import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { getActiveFieldsForProject } from "@/lib/services/customFieldValues";

/**
 * Active custom fields (global + this project's space fields) for issue forms.
 * Readable by anyone who can view issues — the create form needs these before
 * an issue exists. (Existing issues embed fields+values in /api/issues/[id]/full.)
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    const data = await getActiveFieldsForProject(orgId, projectId);
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "Issue", action: "view" } },
);
