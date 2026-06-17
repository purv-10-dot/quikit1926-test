import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { createCustomFieldSchema } from "@/lib/validation/customField";
import { createField, listFields } from "@/lib/services/customFields";

/** Org-level (Global) custom fields. Org/app admins only (FRD §2.2 / §3). */

export const GET = withOrgAuth(async ({ userId, orgId }, req) => {
  if (!(await hasAdminAccess(userId, orgId))) {
    return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  }
  const includeArchived = new URL(req.url).searchParams.get("includeArchived") === "true";
  const data = await listFields({ orgId, scope: "global", includeArchived });
  return NextResponse.json({ success: true, data });
});

export const POST = withOrgAuth(async ({ userId, orgId }, req) => {
  if (!(await hasAdminAccess(userId, orgId))) {
    return NextResponse.json({ success: false, error: "You don't have access to this." }, { status: 403 });
  }
  const body = await req.json().catch(() => null);
  const parsed = createCustomFieldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const res = await createField({ orgId, scope: "global", projectId: null, actorId: userId, input: parsed.data });
  if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: 409 });
  return NextResponse.json({ success: true, data: res.field }, { status: 201 });
});
