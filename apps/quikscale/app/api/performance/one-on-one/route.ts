import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.oneOnOne");
import {
  createOneOnOneSchema,
  listOneOnOnesParamsSchema,
} from "@/lib/schemas/oneOnOneSchema";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";

/**
 * GET /api/performance/one-on-one
 *
 * Lists 1:1s visible to the current user:
 *   - if no filters → returns sessions where user is EITHER manager OR report
 *   - if managerId filter → admin-style lookup for that manager
 *   - if reportId filter → admin-style lookup for that report
 */
export const GET = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const parsed = listOneOnOnesParamsSchema.safeParse({
      managerId: request.nextUrl.searchParams.get("managerId") ?? undefined,
      reportId: request.nextUrl.searchParams.get("reportId") ?? undefined,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid query",
        },
        { status: 400 },
      );
    }
    const { managerId, reportId, from, to, page, pageSize } = parsed.data;

    const where: Record<string, unknown> = { tenantId };
    if (managerId) where.managerId = managerId;
    if (reportId) where.reportId = reportId;
    if (!managerId && !reportId) {
      // Default: user sees their own 1:1s (either role)
      where.OR = [{ managerId: userId }, { reportId: userId }];
    }
    if (from || to) {
      where.scheduledAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [total, sessions] = await Promise.all([
      db.oneOnOne.count({ where }),
      db.oneOnOne.findMany({
        where,
        select: {
          id: true,
          managerId: true,
          reportId: true,
          scheduledAt: true,
          duration: true,
          mood: true,
          completedAt: true,
          createdAt: true,
          manager: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          report: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: sessions,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },
  { fallbackErrorMessage: "Failed to fetch 1:1s" },
);

/**
 * POST /api/performance/one-on-one — schedule a new session.
 */
export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const rl = rateLimit({
      routeKey: "one-on-one:create",
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

    const parsed = createOneOnOneSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: parsed.error.errors[0]?.message ?? "Invalid input",
        },
        { status: 400 },
      );
    }
    const input = parsed.data;

    if (input.managerId === input.reportId) {
      return NextResponse.json(
        {
          success: false,
          error: "Manager and report cannot be the same person",
        },
        { status: 400 },
      );
    }

    // Verify both users are active members of this tenant
    const validCount = await db.membership.count({
      where: {
        tenantId,
        userId: { in: [input.managerId, input.reportId] },
        status: "active",
      },
    });
    if (validCount !== 2) {
      return NextResponse.json(
        {
          success: false,
          error: "Manager or report is not an active member of this tenant",
        },
        { status: 400 },
      );
    }

    const session = await db.oneOnOne.create({
      data: {
        tenantId,
        managerId: input.managerId,
        reportId: input.reportId,
        scheduledAt: new Date(input.scheduledAt),
        duration: input.duration,
        talkingPoints: input.talkingPoints ?? null,
        createdBy: userId,
      },
      select: {
        id: true,
        managerId: true,
        reportId: true,
        scheduledAt: true,
        duration: true,
      },
    });

    return NextResponse.json({ success: true, data: session }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create 1:1" },
);
