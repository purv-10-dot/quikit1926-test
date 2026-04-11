import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createReviewSchema } from "@/lib/schemas/reviewSchema";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = session.user.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const { page, limit, skip, take } = parsePagination(request);
    const where = { tenantId };

    const [reviews, total] = await Promise.all([
      db.performanceReview.findMany({
        where,
        include: {
          reviewer: { select: { id: true, firstName: true, lastName: true, avatar: true } },
          reviewee: { select: { id: true, firstName: true, lastName: true, avatar: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.performanceReview.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(reviews, total, page, limit));
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to fetch reviews") }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const tenantId = session.user.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const parsed = createReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }
    const { revieweeId, quarter, year, rating, strengths, improvements, notes, kpiScore, priorityScore, attendanceScore, overallScore, status } = parsed.data;

    const review = await db.performanceReview.create({
      data: {
        tenantId,
        reviewerId: session.user.id,
        revieweeId,
        quarter,
        year: Number(year),
        rating: rating != null ? Number(rating) : null,
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
  } catch (error: unknown) {
    return NextResponse.json({ success: false, error: toErrorMessage(error, "Failed to create review") }, { status: 500 });
  }
}
