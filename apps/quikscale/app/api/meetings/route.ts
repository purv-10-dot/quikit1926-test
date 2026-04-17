import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("meetings");
import {
  createMeetingSchema,
  listMeetingsParamsSchema,
} from "@/lib/schemas/meetingSchema";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";

/**
 * GET /api/meetings — list meetings for the tenant.
 *
 * Query params:
 *   cadence  — daily | weekly | monthly | quarterly | annual
 *   from     — ISO datetime lower bound (scheduledAt >= from)
 *   to       — ISO datetime upper bound (scheduledAt <= to)
 *   page, pageSize — pagination (default 1/20)
 */
export const GET = withTenantAuth(
  async ({ tenantId }, request) => {
    const parsed = listMeetingsParamsSchema.safeParse({
      cadence: request.nextUrl.searchParams.get("cadence") ?? undefined,
      from: request.nextUrl.searchParams.get("from") ?? undefined,
      to: request.nextUrl.searchParams.get("to") ?? undefined,
      page: request.nextUrl.searchParams.get("page") ?? undefined,
      pageSize: request.nextUrl.searchParams.get("pageSize") ?? undefined,
    });
    if (!parsed.success) return validationError(parsed, "Invalid query");
    const { cadence, from, to, page, pageSize } = parsed.data;

    const where: Record<string, unknown> = { tenantId };
    if (cadence) where.cadence = cadence;
    if (from || to) {
      where.scheduledAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    const [total, meetings] = await Promise.all([
      db.meeting.count({ where }),
      db.meeting.findMany({
        where,
        select: {
          id: true,
          name: true,
          cadence: true,
          scheduledAt: true,
          duration: true,
          location: true,
          meetingLink: true,
          startedOnTime: true,
          endedOnTime: true,
          formatFollowed: true,
          followUpRate: true,
          completedAt: true,
          createdAt: true,
          attendees: {
            select: {
              userId: true,
              attended: true,
            },
          },
        },
        orderBy: { scheduledAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: meetings,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },
  { fallbackErrorMessage: "Failed to fetch meetings" },
);

/**
 * POST /api/meetings — schedule a new meeting.
 */
export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const rl = rateLimit({
      routeKey: "meeting:create",
      clientKey: `${tenantId}:${userId}`,
      limit: LIMITS.mutation.limit,
      windowMs: LIMITS.mutation.windowMs,
    });
    if (!rl.ok) {
      return NextResponse.json(
        { success: false, error: "Too many requests. Try again shortly." },
        { status: 429, headers: { "Retry-After": String(rl.retryAfterSeconds) } },
      );
    }

    const parsed = createMeetingSchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    // Validate template belongs to tenant if provided
    if (input.templateId) {
      const tmpl = await db.meetingTemplate.findFirst({
        where: { id: input.templateId, tenantId },
        select: { id: true },
      });
      if (!tmpl) {
        return NextResponse.json(
          { success: false, error: "Template not found" },
          { status: 404 },
        );
      }
    }

    // Validate all attendees belong to tenant
    if (input.attendeeIds.length > 0) {
      const validCount = await db.membership.count({
        where: {
          tenantId,
          userId: { in: input.attendeeIds },
          status: "active",
        },
      });
      if (validCount !== input.attendeeIds.length) {
        return NextResponse.json(
          { success: false, error: "One or more attendees are not active members" },
          { status: 400 },
        );
      }
    }

    const meeting = await db.meeting.create({
      data: {
        tenantId,
        templateId: input.templateId ?? null,
        name: input.name,
        cadence: input.cadence,
        scheduledAt: new Date(input.scheduledAt),
        duration: input.duration,
        location: input.location ?? null,
        meetingLink: input.meetingLink || null,
        agenda: input.agenda ?? null,
        createdBy: userId,
        attendees: {
          create: input.attendeeIds.map((uid) => ({ userId: uid })),
        },
      },
      select: {
        id: true,
        name: true,
        cadence: true,
        scheduledAt: true,
        duration: true,
      },
    });

    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "CREATE",
      entityType: "Meeting",
      entityId: meeting.id,
      newValues: meeting,
    });

    return NextResponse.json({ success: true, data: meeting }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create meeting" },
);
