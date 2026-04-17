import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kpiNoteSchema } from "@/lib/schemas/kpiSchema";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");

type RouteParams = { id: string };

export const GET = withTenantAuth<RouteParams>(async ({ tenantId }, _req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const notes = await db.kPINote.findMany({
    where: { kpiId: params.id },
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { firstName: true, lastName: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ success: true, data: notes });
}, { fallbackErrorMessage: "Failed to fetch notes" });

export const POST = withTenantAuth<RouteParams>(async ({ tenantId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: { tenantId: true },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.tenantId !== tenantId)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  const validated = kpiNoteSchema.parse(await req.json());

  const note = await db.kPINote.create({
    data: { kpiId: params.id, tenantId, content: validated.content, authorId: userId },
    select: {
      id: true,
      content: true,
      authorId: true,
      createdAt: true,
      updatedAt: true,
      author: { select: { firstName: true, lastName: true } },
    },
  });

  // Update lastNotes on KPI
  await db.kPI.update({
    where: { id: params.id },
    data: { lastNotes: validated.content, lastNotesAt: new Date(), lastNotedBy: userId },
  });

  return NextResponse.json({ success: true, data: note, message: "Note added successfully" }, { status: 201 });
}, { fallbackErrorMessage: "Failed to add note" });
