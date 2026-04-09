import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { kpiNoteSchema } from "@/lib/schemas/kpiSchema";
import { getTenantId } from "@/lib/api/getTenantId";


export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({ where: { id: params.id, deletedAt: null }, select: { tenantId: true } });
    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const notes = await db.kPINote.findMany({
      where: { kpiId: params.id },
      select: { id: true, content: true, authorId: true, createdAt: true, updatedAt: true,
        author: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ success: true, data: notes });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to fetch notes" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = await getTenantId(session.user.id);
    if (!tenantId) return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });

    const kpi = await db.kPI.findUnique({ where: { id: params.id, deletedAt: null }, select: { tenantId: true } });
    if (!kpi) return NextResponse.json({ success: false, error: "KPI not found" }, { status: 404 });
    if (kpi.tenantId !== tenantId) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 403 });

    const body = await request.json();
    const validated = kpiNoteSchema.parse(body);

    const note = await db.kPINote.create({
      data: { kpiId: params.id, tenantId, content: validated.content, authorId: session.user.id },
      select: { id: true, content: true, authorId: true, createdAt: true, updatedAt: true,
        author: { select: { firstName: true, lastName: true } } },
    });

    // Update lastNotes on KPI
    await db.kPI.update({
      where: { id: params.id },
      data: { lastNotes: validated.content, lastNotesAt: new Date(), lastNotedBy: session.user.id },
    });

    return NextResponse.json({ success: true, data: note, message: "Note added successfully" }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message || "Failed to add note" }, { status: 500 });
  }
}
