import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { updateClientMemberSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext, classifyUpdateAction, diffFields, CLIENT_MEMBER_AUDIT_FIELDS } from "@/lib/audit";

const withOrgAuth = withOrgAuthForModule("clientMeetings.members");

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const row = await db.clientMember.findFirst({
    where: { id: params.id, orgId, deletedAt: null },
  });
  if (!row) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });
  return NextResponse.json({
    success: true,
    data: {
      id: row.id, name: row.name, email: row.email,
      createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
    },
  });
});

export const PUT = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const parsed = updateClientMemberSchema.safeParse(await request.json());
  if (!parsed.success)
    return NextResponse.json({ success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" }, { status: 400 });

  const existing = await db.clientMember.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

  // If email changes, re-check uniqueness within tenant.
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const dup = await db.clientMember.findFirst({
      where: { orgId, email: parsed.data.email, deletedAt: null, id: { not: params.id } },
    });
    if (dup) return NextResponse.json({ success: false, error: "A member with that email already exists" }, { status: 409 });
  }

  const oldValues = { name: existing.name, email: existing.email };
  const updated = await db.clientMember.update({
    where: { id: params.id },
    data: { name: parsed.data.name, email: parsed.data.email, updatedBy: userId },
  });

  // Diff — only record keys that actually changed.
  const newValues = { name: updated.name, email: updated.email };
  const changes = Object.keys(newValues).filter(k => (oldValues as Record<string, unknown>)[k] !== (newValues as Record<string, unknown>)[k]);

  if (changes.length) {
    await writeAuditLog({
      orgId, actorId: userId, action: "UPDATE",
      entityType: "ClientMember", entityId: params.id,
      oldValues, newValues, changes,
    });
  }

  // ── Centralized audit (dual-write) ── field-level diff (name / email).
  const auditChanges = diffFields(oldValues, newValues, { include: CLIENT_MEMBER_AUDIT_FIELDS });
  await audit.log({
    entityType: "CLIENT_MEMBER",
    entityId: params.id,
    action: classifyUpdateAction(auditChanges.map((c) => c.fieldName)),
    actor: { userId, orgId, teamId: null },
    changes: auditChanges,
    skipIfNoChanges: true,
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
  const existing = await db.clientMember.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

  // Optional (never required) reason — shown in the timeline if provided.
  const body = await request.json().catch(() => ({}));
  const reason =
    typeof body?.reason === "string" && body.reason.trim() ? body.reason.trim() : null;

  await db.clientMember.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "DELETE",
    entityType: "ClientMember", entityId: params.id,
    oldValues: { name: existing.name, email: existing.email },
    reason: reason ?? undefined,
  });

  // ── Centralized audit (dual-write) ── DELETE with a snapshot (name = identity).
  await audit.log({
    entityType: "CLIENT_MEMBER",
    entityId: params.id,
    action: "DELETE",
    actor: { userId, orgId, teamId: null },
    reason,
    snapshot: { name: existing.name, email: existing.email },
    ...requestContext(request),
  });

  return NextResponse.json({ success: true });
});
