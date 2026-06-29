import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { getActiveFieldsForProject } from "@/lib/services/customFieldValues";

/**
 * Active custom fields (global + this project's space fields) for issue forms.
 * Readable by ANY project member — the create form needs the field catalog
 * before an issue exists, and issue visibility is membership-based, not gated
 * by a permission (there is no `Issue:view` grant — see permissionsRegistry).
 * Gating this on `Issue:view` previously hid every space custom field from
 * Contributors/Viewers, since only Space/app admins satisfy that non-existent
 * grant. Membership (enforced by withProjectAccess) is the correct boundary.
 * (Existing issues embed fields+values in /api/issues/[id]/full.)
 */
export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }) => {
    const data = await getActiveFieldsForProject(orgId, projectId);
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id" },
);
