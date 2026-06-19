import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { kpiNoteSchema } from "@/lib/schemas/kpiSchema";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("kpi");

type RouteParams = { id: string };

export const GET = withOrgAuth<RouteParams>(async ({ orgId }, _req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: { orgId: true },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId)
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

export const POST = withOrgAuth<RouteParams>(async ({ orgId, userId }, req, { params }) => {
  const kpi = await db.kPI.findUnique({
    where: { id: params.id },
    select: { orgId: true },
  });
  if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
  if (kpi.orgId !== orgId)
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

  // safeParse → 400 with friendly message instead of an opaque 500 when
  // the user pastes a >5000-char note.
  const parsed = kpiNoteSchema.safeParse(await req.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }
  const validated = parsed.data;

  const note = await db.kPINote.create({
    data: { kpiId: params.id, orgId, content: validated.content, authorId: userId },
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
