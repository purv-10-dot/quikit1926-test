import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createReviewSchema } from "@/lib/schemas/reviewSchema";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.reviews");

export const GET = withTenantAuth(
  async ({ tenantId }, request) => {
    const { page, limit, skip, take } = parsePagination(request);
    const where = { tenantId };

    const [reviews, total] = await Promise.all([
      db.performanceReview.findMany({
        where,
        include: {
          reviewer: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
          reviewee: {
            select: { id: true, firstName: true, lastName: true, avatar: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take,
      }),
      db.performanceReview.count({ where }),
    ]);

    return NextResponse.json(paginatedResponse(reviews, total, page, limit));
  },
  { fallbackErrorMessage: "Failed to fetch reviews" },
);

export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const parsed = createReviewSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const {
      revieweeId,
      quarter,
      year,
      rating,
      strengths,
      improvements,
      notes,
      kpiScore,
      priorityScore,
      attendanceScore,
      overallScore,
      status,
    } = parsed.data;

    const review = await db.performanceReview.create({
      data: {
        tenantId,
        reviewerId: userId,
        revieweeId,
        quarter,
        year: Number(year),
        rating: rating != null ? Number(rating) : null,
        strengths,
        improvements,
        notes,
        kpiScore: kpiScore != null ? Number(kpiScore) : null,
        priorityScore: priorityScore != null ? Number(priorityScore) : null,
        attendanceScore:
          attendanceScore != null ? Number(attendanceScore) : null,
        overallScore: overallScore != null ? Number(overallScore) : null,
        status: status || "draft",
      },
      include: {
        reviewer: { select: { id: true, firstName: true, lastName: true } },
        reviewee: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    return NextResponse.json({ success: true, data: review });
  },
  { fallbackErrorMessage: "Failed to create review" },
);
