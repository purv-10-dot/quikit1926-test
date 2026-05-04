import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
import { updateClientMemberSchema } from "@/lib/schemas/clientMeetingsSchema";
import { writeAuditLog } from "@/lib/api/auditLog";

const withTenantAuth = withTenantAuthForModule("clientMeetings.members");

export const GET = withTenantAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
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

export const PUT = withTenantAuth<{ id: string }>(async ({ orgId, userId }, request, { params }) => {
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

  return NextResponse.json({ success: true });
});

export const DELETE = withTenantAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const existing = await db.clientMember.findFirst({ where: { id: params.id, orgId, deletedAt: null } });
  if (!existing) return NextResponse.json({ success: false, error: "Member not found" }, { status: 404 });

  await db.clientMember.update({ where: { id: params.id }, data: { deletedAt: new Date(), updatedBy: userId } });
  await writeAuditLog({
    orgId, actorId: userId, action: "DELETE",
    entityType: "ClientMember", entityId: params.id,
    oldValues: { name: existing.name, email: existing.email },
  });
  return NextResponse.json({ success: true });
});
