import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: { reviewId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const review = await db.performanceReview.findUnique({
      where: { id: params.reviewId },
      include: {
        reviewer: true,
        reviewee: {
          include: {
            kpisOwned: { include: { weeklyValues: true } },
            prioritiesOwned: { include: { weeklyStatuses: true } },
          }
        }
      }
    });

    if (!review) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, data: review });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { reviewId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const review = await db.performanceReview.update({
      where: { id: params.reviewId },
      data: {
        rating: body.rating ? Number(body.rating) : null,
        strengths: body.strengths,
        improvements: body.improvements,
        notes: body.notes,
        status: body.status,
        kpiScore: body.kpiScore != null ? Number(body.kpiScore) : null,
        priorityScore: body.priorityScore != null ? Number(body.priorityScore) : null,
        attendanceScore: body.attendanceScore != null ? Number(body.attendanceScore) : null,
        overallScore: body.overallScore != null ? Number(body.overallScore) : null,
      }
    });

    return NextResponse.json({ success: true, data: review });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
