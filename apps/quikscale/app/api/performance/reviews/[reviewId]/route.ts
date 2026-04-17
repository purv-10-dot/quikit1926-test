import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { updateReviewSchema } from "@/lib/schemas/reviewSchema";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.reviews");

export const GET = withTenantAuth<{ reviewId: string }>(
  async ({ tenantId }, _req, { params }) => {
    // Tenant-scoped lookup: never cross-tenant
    const review = await db.performanceReview.findFirst({
      where: { id: params.reviewId, tenantId },
      include: {
        reviewer: true,
        reviewee: {
          include: {
            kpisOwned: { include: { weeklyValues: true } },
            prioritiesOwned: { include: { weeklyStatuses: true } },
          },
        },
      },
    });

    if (!review) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: review });
  },
);

export const PUT = withTenantAuth<{ reviewId: string }>(
  async ({ tenantId }, req, { params }) => {
    const parsed = updateReviewSchema.safeParse(await req.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const body = parsed.data;

    // Verify the review belongs to the caller's tenant before updating
    const existing = await db.performanceReview.findFirst({
      where: { id: params.reviewId, tenantId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Not found" },
        { status: 404 },
      );
    }

    const review = await db.performanceReview.update({
      where: { id: params.reviewId },
      data: {
        rating: body.rating != null ? Number(body.rating) : null,
        strengths: body.strengths,
        improvements: body.improvements,
        notes: body.notes,
        status: body.status,
        kpiScore: body.kpiScore != null ? Number(body.kpiScore) : null,
        priorityScore:
          body.priorityScore != null ? Number(body.priorityScore) : null,
        attendanceScore:
          body.attendanceScore != null ? Number(body.attendanceScore) : null,
        overallScore:
          body.overallScore != null ? Number(body.overallScore) : null,
      },
    });

    return NextResponse.json({ success: true, data: review });
  },
);
