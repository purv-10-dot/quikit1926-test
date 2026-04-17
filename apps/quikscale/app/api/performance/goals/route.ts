import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.goals");
import {
  createGoalSchema,
  listGoalsParamsSchema,
} from "@/lib/schemas/goalSchema";
import { validationError } from "@/lib/api/validationError";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";

/**
 * GET /api/performance/goals
 * Filters: ownerId / quarter / year / status / parentGoalId
 */
export const GET = withTenantAuth(
  async ({ tenantId }, request) => {
    const parsed = listGoalsParamsSchema.safeParse({
      ownerId: request.nextUrl.searchParams.get("ownerId") ?? undefined,
      quarter: request.nextUrl.searchParams.get("quarter") ?? undefined,
      year: request.nextUrl.searchParams.get("year") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      parentGoalId: request.nextUrl.searchParams.get("parentGoalId") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) return validationError(parsed, "Invalid query");
    const { ownerId, quarter, year, status, parentGoalId, page, pageSize } =
      parsed.data;

    const where: Record<string, unknown> = { tenantId };
    if (ownerId) where.ownerId = ownerId;
    if (quarter) where.quarter = quarter;
    if (year) where.year = year;
    if (status) where.status = status;
    if (parentGoalId) where.parentGoalId = parentGoalId;

    const [total, goals] = await Promise.all([
      db.goal.count({ where }),
      db.goal.findMany({
        where,
        select: {
          id: true,
          title: true,
          description: true,
          category: true,
          ownerId: true,
          parentGoalId: true,
          targetValue: true,
          currentValue: true,
          unit: true,
          progressPercent: true,
          quarter: true,
          year: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          completedAt: true,
          owner: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: [{ year: "desc" }, { quarter: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: goals,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },
  { fallbackErrorMessage: "Failed to fetch goals" },
);

/**
 * POST /api/performance/goals
 */
export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const rl = rateLimit({
      routeKey: "goal:create",
      clientKey: `${tenantId}:${userId}`,
      limit: LIMITS.mutation.limit,
      windowMs: LIMITS.mutation.windowMs,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again shortly." },
        {
          status: 429,
          headers: { "Retry-After": String(rl.retryAfterSeconds) },
        },
      );
    }

    const parsed = createGoalSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    // Verify owner is a member of this tenant
    const ownerMembership = await db.membership.findFirst({
      where: { tenantId, userId: input.ownerId, status: "active" },
      select: { id: true },
    });
    if (!ownerMembership) {
      return NextResponse.json(
        { success: false, error: "Goal owner is not an active member" },
        { status: 400 },
      );
    }

    // If parentGoalId given, verify it's in the same tenant
    if (input.parentGoalId) {
      const parent = await db.goal.findFirst({
        where: { id: input.parentGoalId, tenantId },
        select: { id: true },
      });
      if (!parent) {
        return NextResponse.json(
          { success: false, error: "Parent goal not found" },
          { status: 404 },
        );
      }
    }

    // Auto-compute progressPercent if both target & current are set
    let progressPercent: number | null = null;
    if (
      typeof input.targetValue === "number" &&
      typeof input.currentValue === "number" &&
      input.targetValue > 0
    ) {
      progressPercent = Math.round((input.currentValue / input.targetValue) * 100);
    }

    const goal = await db.goal.create({
      data: {
        tenantId,
        ownerId: input.ownerId,
        parentGoalId: input.parentGoalId ?? null,
        title: input.title,
        description: input.description ?? null,
        category: input.category ?? null,
        targetValue: input.targetValue ?? null,
        currentValue: input.currentValue ?? null,
        unit: input.unit ?? null,
        progressPercent,
        quarter: input.quarter ?? null,
        year: input.year,
        status: input.status,
        createdBy: userId,
      },
      select: {
        id: true,
        title: true,
        ownerId: true,
        year: true,
        quarter: true,
        status: true,
        progressPercent: true,
      },
    });

    return NextResponse.json({ success: true, data: goal }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create goal" },
);
