import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("people.feedback");
import {
  createFeedbackSchema,
  listFeedbackParamsSchema,
} from "@/lib/schemas/feedbackSchema";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";

/**
 * GET /api/performance/feedback
 *
 * Visibility rules:
 *   - `private` feedback is only visible to the sender and receiver
 *   - `shared` feedback is visible to the receiver's manager too (future: wire to OneOnOne)
 *
 * Default (no filters) returns feedback where the current user is EITHER
 * the sender or receiver. Admin-style lookups via explicit filters.
 */
export const GET = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const parsed = listFeedbackParamsSchema.safeParse({
      toUserId: request.nextUrl.searchParams.get("toUserId") ?? undefined,
      fromUserId: request.nextUrl.searchParams.get("fromUserId") ?? undefined,
      category: request.nextUrl.searchParams.get("category") ?? undefined,
      visibility: request.nextUrl.searchParams.get("visibility") ?? undefined,
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
    const { toUserId, fromUserId, category, visibility, from, to, page, pageSize } =
      parsed.data;

    const where: Record<string, unknown> = { tenantId };
    if (category) where.category = category;
    if (visibility) where.visibility = visibility;
    if (from || to) {
      where.createdAt = {
        ...(from ? { gte: new Date(from) } : {}),
        ...(to ? { lte: new Date(to) } : {}),
      };
    }

    // Visibility: always enforce that the caller can see the row
    if (toUserId || fromUserId) {
      if (toUserId) where.toUserId = toUserId;
      if (fromUserId) where.fromUserId = fromUserId;
      // If the caller is looking at OTHER people's feedback, only shared rows allowed
      const callerIsInvolved = toUserId === userId || fromUserId === userId;
      if (!callerIsInvolved) where.visibility = "shared";
    } else {
      where.OR = [{ fromUserId: userId }, { toUserId: userId }];
    }

    const [total, entries] = await Promise.all([
      db.feedbackEntry.count({ where }),
      db.feedbackEntry.findMany({
        where,
        select: {
          id: true,
          fromUserId: true,
          toUserId: true,
          category: true,
          visibility: true,
          content: true,
          relatedType: true,
          relatedId: true,
          createdAt: true,
          fromUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
          toUser: {
            select: { id: true, firstName: true, lastName: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: entries,
      meta: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  },
  { fallbackErrorMessage: "Failed to fetch feedback" },
);

/**
 * POST /api/performance/feedback — drop feedback about another user.
 */
export const POST = withTenantAuth(
  async ({ tenantId, userId }, request) => {
    const rl = rateLimit({
      routeKey: "feedback:create",
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

    const parsed = createFeedbackSchema.safeParse(await request.json());
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

    if (input.toUserId === userId) {
      return NextResponse.json(
        { success: false, error: "You cannot leave feedback on yourself" },
        { status: 400 },
      );
    }

    // Verify recipient is an active member
    const recipientOk = await db.membership.findFirst({
      where: { tenantId, userId: input.toUserId, status: "active" },
      select: { id: true },
    });
    if (!recipientOk) {
      return NextResponse.json(
        { success: false, error: "Recipient is not an active member" },
        { status: 400 },
      );
    }

    const entry = await db.feedbackEntry.create({
      data: {
        tenantId,
        fromUserId: userId,
        toUserId: input.toUserId,
        category: input.category,
        visibility: input.visibility,
        content: input.content,
        relatedType: input.relatedType ?? null,
        relatedId: input.relatedId ?? null,
      },
      select: {
        id: true,
        fromUserId: true,
        toUserId: true,
        category: true,
        visibility: true,
        createdAt: true,
      },
    });

    // TODO: Add email notification when email service is configured

    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  },
  { fallbackErrorMessage: "Failed to create feedback" },
);
