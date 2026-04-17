import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("www");
import { parsePagination, paginatedResponse } from "@/lib/api/pagination";
import { createWWWSchema } from "@/lib/schemas/wwwSchema";
import { validationError } from "@/lib/api/validationError";
import { writeAuditLog } from "@/lib/api/auditLog";
import { rateLimit, LIMITS } from "@/lib/api/rateLimit";

// GET /api/www — list all WWWItems for tenant
export const GET = withTenantAuth(async ({ tenantId }, req) => {
  const searchParams = req.nextUrl.searchParams;
  const search = searchParams.get("search") || undefined;
  const status = searchParams.get("status") || undefined;
  const sortBy = searchParams.get("sortBy") || "createdAt";
  const sortOrder = (searchParams.get("sortOrder") || "asc") as "asc" | "desc";
  const { page, limit, skip, take } = parsePagination(req);

  const where: Record<string, unknown> = { tenantId };
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { what:  { contains: search, mode: "insensitive" } },
      { notes: { contains: search, mode: "insensitive" } },
    ];
  }

  // Allowed sort fields
  const sortMap: Record<string, Record<string, "asc" | "desc">> = {
    who: { who: sortOrder },
    when: { when: sortOrder },
    what: { what: sortOrder },
    revisedDate: { when: sortOrder }, // revisedDates is JSON array; fall back to when
    status: { status: sortOrder },
    notes: { notes: sortOrder },
    createdAt: { createdAt: sortOrder },
  };
  const orderBy = sortMap[sortBy] || { createdAt: sortOrder };

  const [items, total] = await Promise.all([
    db.wWWItem.findMany({
      where,
      orderBy: orderBy as any,
      skip,
      take,
    }),
    db.wWWItem.count({ where }),
  ]);

  // Build user map for who_user
  const whoIds = [...new Set(items.map(i => i.who).filter(Boolean))];
  const users = whoIds.length
    ? await db.user.findMany({
        where: { id: { in: whoIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : [];
  const userMap = Object.fromEntries(users.map(u => [u.id, u]));

  const result = items.map(item => ({
    ...item,
    when: item.when.toISOString(),
    originalDueDate: item.originalDueDate?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    who_user: userMap[item.who] ?? null,
  }));

  return NextResponse.json(paginatedResponse(result, total, page, limit));
});

// POST /api/www — create a WWWItem
export const POST = withTenantAuth(async ({ tenantId, userId }, req) => {
  const rl = rateLimit({
    routeKey: "www:create",
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

  const body = await req.json();
  const parsed = createWWWSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed);
  const { who, what, when, status, notes, category, originalDueDate } = parsed.data;

  const item = await db.wWWItem.create({
    data: {
      tenantId,
      who,
      what,
      when: new Date(when),
      status: status ?? "not-yet-started",
      notes: notes ?? null,
      category: category ?? null,
      originalDueDate: originalDueDate ? new Date(originalDueDate) : null,
      revisedDates: [],
      createdBy: userId,
    },
  });

  // Attach who_user
  const whoUser = await db.user.findUnique({
    where: { id: item.who },
    select: { id: true, firstName: true, lastName: true },
  });

  const result = {
    ...item,
    when: item.when.toISOString(),
    originalDueDate: item.originalDueDate?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    who_user: whoUser ?? null,
  };

  await writeAuditLog({
    tenantId,
    actorId: userId,
    action: "CREATE",
    entityType: "WWWItem",
    entityId: item.id,
    newValues: item,
  });

  return NextResponse.json({ success: true, data: result }, { status: 201 });
});
