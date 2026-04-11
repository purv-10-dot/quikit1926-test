import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { updateReviewSchema } from "@/lib/schemas/reviewSchema";

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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error) }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: { reviewId: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const parsed = updateReviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const body = parsed.data;
    const review = await db.performanceReview.update({
      where: { id: params.reviewId },
      data: {
        rating: body.rating != null ? Number(body.rating) : null,
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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error) }, { status: 500 });
  }
}
