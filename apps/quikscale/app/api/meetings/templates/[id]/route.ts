import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings.templates");
import { updateTemplateSchema } from "@/lib/schemas/meetingSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";

type Params = { id: string };

/**
 * GET /api/meetings/templates/:id — fetch a single template
 */
export const GET = withTenantAuth<Params>(
  async ({ tenantId }, _req, { params }) => {
    const template = await db.meetingTemplate.findFirst({
      where: { id: params.id, tenantId },
      select: {
        id: true,
        name: true,
        cadence: true,
        description: true,
        sections: true,
        defaultAttendees: true,
        duration: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!template) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: template });
  },
  { fallbackErrorMessage: "Failed to fetch template" },
);

/**
 * PUT /api/meetings/templates/:id — update a template
 *
 * All fields optional; only provided fields are written. Tenant-scoped:
 * templates from other tenants 404 even when the id exists.
 */
export const PUT = withTenantAuth<Params>(
  async ({ tenantId, userId }, request, { params }) => {
    const existing = await db.meetingTemplate.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    const parsed = updateTemplateSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    // Build update payload — skip undefined keys so partial updates work
    const data: Record<string, unknown> = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.cadence !== undefined) data.cadence = input.cadence;
    if (input.description !== undefined) data.description = input.description;
    if (input.sections !== undefined) data.sections = input.sections;
    if (input.defaultAttendees !== undefined)
      data.defaultAttendees = input.defaultAttendees;
    if (input.duration !== undefined) data.duration = input.duration;

    const updated = await db.meetingTemplate.update({
      where: { id: params.id },
      data,
      select: {
        id: true,
        name: true,
        cadence: true,
        description: true,
        sections: true,
        defaultAttendees: true,
        duration: true,
      },
    });

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Meeting",
      entityId: params.id,
      newValues: updated,
    });

    return NextResponse.json({ success: true, data: updated });
  },
  { fallbackErrorMessage: "Failed to update template" },
);

/**
 * DELETE /api/meetings/templates/:id — hard delete
 *
 * Safe because the `Meeting → MeetingTemplate` relation uses
 * `onDelete: SetNull` — existing meetings that reference the template
 * simply lose their `templateId` pointer without cascading deletes.
 */
export const DELETE = withTenantAuth<Params>(
  async ({ tenantId, userId }, _req, { params }) => {
    const existing = await db.meetingTemplate.findFirst({
      where: { id: params.id, tenantId },
      select: { id: true, name: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Template not found" },
        { status: 404 },
      );
    }

    await db.meetingTemplate.delete({ where: { id: params.id } });

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "DELETE",
      entityType: "Meeting",
      entityId: params.id,
      oldValues: existing,
    });

    return NextResponse.json({ success: true, message: "Template deleted" });
  },
  { fallbackErrorMessage: "Failed to delete template" },
);
