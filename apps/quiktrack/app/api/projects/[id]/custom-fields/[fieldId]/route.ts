import { NextResponse } from "next/server";
import { withProjectAccess } from "@/lib/api/withProjectAccess";
import { updateCustomFieldSchema } from "@/lib/validation/customField";
import { deleteOrArchiveField, getField, updateField } from "@/lib/services/customFields";

/** Single space custom field — view / edit / archive / delete. Space admins. */

const GATE = { paramKey: "id", requirePermission: { resource: "ProjectMember", action: "update" } } as const;

/** Ensure the field exists, is a space field, and belongs to THIS project. */
async function loadScoped(orgId: string, projectId: string, fieldId: string) {
  const field = await getField(orgId, fieldId);
  if (!field || field.scope !== "space" || field.projectId !== projectId) return null;
  return field;
}

export const GET = withProjectAccess<{ id: string; fieldId: string }>(async ({ orgId, projectId }, _req, { params }) => {
  const field = await loadScoped(orgId, projectId, params.fieldId);
  if (!field) return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: field });
}, GATE);

export const PATCH = withProjectAccess<{ id: string; fieldId: string }>(async ({ userId, orgId, projectId }, req, { params }) => {
  if (!(await loadScoped(orgId, projectId, params.fieldId))) {
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
  const res = await updateField({ orgId, fieldId: params.fieldId, actorId: userId, input: parsed.data });
  if (!res.ok) return NextResponse.json({ success: false, error: res.error }, { status: res.status ?? 400 });
  return NextResponse.json({ success: true, data: res.field });
}, GATE);

export const DELETE = withProjectAccess<{ id: string; fieldId: string }>(async ({ userId, orgId, projectId }, req, { params }) => {
  if (!(await loadScoped(orgId, projectId, params.fieldId))) {
    return NextResponse.json({ success: false, error: "Field not found" }, { status: 404 });
  }
  const confirmArchive = new URL(req.url).searchParams.get("confirmArchive") === "true";
  const res = await deleteOrArchiveField({ orgId, fieldId: params.fieldId, actorId: userId, confirmArchive });
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
}, GATE);
