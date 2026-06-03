import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createSWTEntrySchema } from "@/lib/schemas/swtSchema";
import { validationError } from "@/lib/api/validationError";

export const GET = withOrgAuth(
  async ({ orgId }, request) => {
    const { searchParams } = request.nextUrl;
    const year    = searchParams.get("year")    ? Number(searchParams.get("year"))    : undefined;
    const quarter = searchParams.get("quarter") ?? undefined;

    const where: Record<string, unknown> = { orgId };
    if (year)    where.year    = year;
    if (quarter) where.quarter = quarter;

    const entries = await db.sWTEntry.findMany({
      where,
      orderBy: [{ type: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json({ success: true, data: entries });
  },
  { moduleKey: "swt", fallbackErrorMessage: "Failed to fetch SWT entries" },
);

export const POST = withOrgAuth(
  async ({ orgId, userId }, request) => {
    const parsed = createSWTEntrySchema.safeParse(await request.json());
    if (!parsed.success) return validationError(parsed);
    const input = parsed.data;

    const entry = await db.sWTEntry.create({
      data: {
        orgId,
        createdBy:      userId,
        quarter:        input.quarter,
        year:           input.year,
        type:           input.type,
        content:        input.content,
        impact:         input.impact ?? null,
        category:       input.type === "trend" ? (input.category ?? null) : null,
        trendDirection: input.type === "trend" ? (input.trendDirection ?? "neutral") : null,
        sortOrder:      input.sortOrder ?? 0,
      },
    });
    return NextResponse.json({ success: true, data: entry }, { status: 201 });
  },
  { moduleKey: "swt", fallbackErrorMessage: "Failed to create SWT entry" },
);
