import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { hasAdminAccess } from "@/lib/api/permissions";
import { updateCustomFieldSchema } from "@/lib/validation/customField";
import { deleteOrArchiveField, getField, updateField } from "@/lib/services/customFields";

/** Single Global custom field — view / edit / archive / delete. Admins only. */

async function requireAdmin(userId: string, orgId: string): Promise<NextResponse | null> {
  if (!(await hasAdminAccess(userId, orgId))) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export const GET = withOrgAuth<{ id: string }>(async ({ userId, orgId }, _req, { params }) => {
  const denied = await requireAdmin(userId, orgId);
  if (denied) return denied;
  const field = await getField(orgId, params.id);
  if (!field || field.scope !== "global") {
    return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true, data: field });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ userId, orgId }, req, { params }) => {
  const denied = await requireAdmin(userId, orgId);
  if (denied) return denied;
  const existing = await getField(orgId, params.id);
  if (!existing || existing.scope !== "global") {
    return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  }
  const body = await req.json().catch(() => null);
  const parsed = updateCustomFieldSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const res = await updateField({ orgId, fieldId: params.id, actorId: userId, input: parsed.data });
  if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: res.status ?? 400 });
  return NextResponse.json({ success: true, data: res.field });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ userId, orgId }, req, { params }) => {
  const denied = await requireAdmin(userId, orgId);
  if (denied) return denied;
  const existing = await getField(orgId, params.id);
  if (!existing || existing.scope !== "global") {
    return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  }
  const confirmArchive = new URL(req.url).searchParams.get("confirmArchive") === "true";
  const res = await deleteOrArchiveField({ orgId, fieldId: params.id, actorId: userId, confirmArchive });
  if (!res.ok) {
    if ("needsArchive" in res) {
      return NextResponse.json(
        { success: false, error: "Field has stored values.", needsArchive: true, issueCount: res.issueCount },
        { status: 409 },
      );
    }
    return NextResponse.json({ success: false, error: res.error }, { status: res.status ?? 400 });
  }
  return NextResponse.json({ success: true, data: { action: res.action, issueCount: res.issueCount } });
});
