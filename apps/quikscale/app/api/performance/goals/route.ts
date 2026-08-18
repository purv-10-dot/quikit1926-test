import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
const withOrgAuth = withOrgAuthForModule("people.goals");
import {
  createGoalSchema,
  listGoalsParamsSchema,
} from "@/lib/schemas/goalSchema";
import { validationError } from "@/lib/api/validationError";
import { rateLimitAsync, LIMITS } from "@/lib/api/rateLimit";
import { emitGoalCreated } from "@/lib/services/workflowEvents";

/**
 * GET /api/performance/goals
 * Filters: ownerId / quarter / year / status / parentGoalId
 */
export const GET = withOrgAuth(
  async ({ orgId }, request) => {
    const parsed = listGoalsParamsSchema.safeParse({
      ownerId: request.nextUrl.searchParams.get("ownerId") ?? undefined,
      quarter: request.nextUrl.searchParams.get("quarter") ?? undefined,
      year: request.nextUrl.searchParams.get("year") ?? undefined,
      status: request.nextUrl.searchParams.get("status") ?? undefined,
      parentGoalId: request.nextUrl.searchParams.get("parentGoalId") ?? undefined,
      search: request.nextUrl.searchParams.get("search") ?? undefined,
      sortBy: request.nextUrl.searchParams.get("sortBy") ?? undefined,
      sortOrder: request.nextUrl.searchParams.get("sortOrder") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) return validationError(parsed, "Invalid query");
    const { ownerId, quarter, year, status, parentGoalId, search, sortBy, sortOrder, page, pageSize } =
      parsed.data;

    const where: Record<string, unknown> = { orgId };
    if (ownerId) where.ownerId = ownerId;
    if (quarter) where.quarter = quarter;
    if (year) where.year = year;
    if (status) where.status = status;
    if (parentGoalId) where.parentGoalId = parentGoalId;
    if (search) {
      where.OR = [
        { title: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
      ];
    }

    // DB-level sort. A single sortBy maps to one column; otherwise fall back to
    // the chronological default. `id` is appended as a stable tie-breaker so
    // pagination never drops/duplicates rows that share a sort value.
    const orderBy = sortBy
      ? [{ [sortBy]: sortOrder }, { id: "desc" as const }]
      : [
          { year: "desc" as const },
          { quarter: "desc" as const },
          { createdAt: "desc" as const },
        ];

    const [total, goals, statusGroups] = await Promise.all([
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
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      // Status breakdown across the FULL filtered set (ignores pagination) so
      // the page's stats strip stays accurate while only one page is fetched.
      db.goal.groupBy({ by: ["status"], where, _count: { _all: true } }),
    ]);

    const byStatus = Object.fromEntries(
      statusGroups.map((g) => [g.status, g._count._all]),
    ) as Record<string, number>;
    const stats = {
      total,
      onTrack: byStatus["on-track"] ?? 0,
      atRisk: byStatus["at-risk"] ?? 0,
      completed: byStatus["completed"] ?? 0,
    };

    return NextResponse.json({
      success: true,
      data: goals,
      stats,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },
  { fallbackErrorMessage: "Failed to fetch goals" },
);

/**
 * POST /api/performance/goals
 */
export const POST = withOrgAuth(
  async ({ orgId, userId }, request) => {
    const rl = await rateLimitAsync({
      routeKey: "goal:create",
      clientKey: `${orgId}:${userId}`,
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
    const ownerMembership = await db.orgMember.findFirst({
      where: { orgId, userId: input.ownerId, status: "active" },
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
        where: { id: input.parentGoalId, orgId },
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
        orgId,
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

    // QuikFlow: emit goal.created (fire-and-forget, flag-gated).
    emitGoalCreated({
      orgId,
      goalId: goal.id,
      title: input.title,
      owner: input.ownerId,
      category: input.category ?? null,
      status: input.status,
    });

    return NextResponse.json({ success: true, data: goal }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create goal" },
);
