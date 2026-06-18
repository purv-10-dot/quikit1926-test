import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { createCustomFieldSchema } from "@/lib/validation/customField";
import { createField, listFields } from "@/lib/services/customFields";

/**
 * Space-level custom field management. Gated to space admins via
 * ProjectMember:update (the existing "space admin" signal — see RBAC decision).
 */

export const GET = withProjectAccess<{ id: string }>(
  async ({ orgId, projectId }, req) => {
    const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
    const data = await listFields({ orgId, scope: "space", projectId, includeArchived });
    return NextResponse.json({ success: true, data });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } },
);

export const POST = withProjectAccess<{ id: string }>(
  async ({ userId, orgId, projectId }, req) => {
    const body = await req.json().catch(() => null);
    const parsed = createCustomFieldSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 },
      );
    }
    const res = await createField({ orgId, scope: "space", projectId, actorId: userId, input: parsed.data });
    if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: 409 });
    return NextResponse.json({ success: true, data: res.field }, { status: 201 });
  },
  { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } },
);
