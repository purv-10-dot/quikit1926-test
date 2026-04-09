import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, include: { memberships: true } });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const reviews = await db.performanceReview.findMany({
      where: { tenantId },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
      },
      orderBy: { createdAt: "desc" }
    });

    return NextResponse.json({ success: true, data: reviews });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, include: { memberships: true } });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const body = await req.json();
    const { revieweeId, quarter, year, rating, strengths, improvements, notes, kpiScore, priorityScore, attendanceScore, overallScore, status } = body;

    const review = await db.performanceReview.create({
      data: {
        tenantId,
        reviewerId: session.user.id,
        revieweeId,
        quarter,
        year: Number(year),
        rating: rating ? Number(rating) : null,
        strengths,
        improvements,
        notes,
        kpiScore: kpiScore != null ? Number(kpiScore) : null,
        priorityScore: priorityScore != null ? Number(priorityScore) : null,
        attendanceScore: attendanceScore != null ? Number(attendanceScore) : null,
        overallScore: overallScore != null ? Number(overallScore) : null,
        status: status || "draft",
      },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true } },
      }
    });

    return NextResponse.json({ success: true, data: review });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
