import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { createSWTEntrySchema, SWT_TYPE_LIMITS, SWT_TYPE_CONFIG } from "@/lib/schemas/swtSchema";
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

    // Per-quarter cap per type (strength/weakness ≤ 3, trend ≤ 6). Counting
    // scoped to (org, year, quarter, type) — each quarter's SWT is its own set.
    // Note: this is a count guard, not a DB constraint, so a burst of truly
    // simultaneous creates could momentarily exceed by one; acceptable for a
    // soft, low-frequency business cap.
    const limit = SWT_TYPE_LIMITS[input.type];
    const existing = await db.sWTEntry.count({
      where: { orgId, year: input.year, quarter: input.quarter, type: input.type },
    });
    if (existing >= limit) {
      const label = SWT_TYPE_CONFIG[input.type].label.toLowerCase();
      return NextResponse.json(
        { success: false, error: `You can add at most ${limit} ${label} per quarter. Remove one before adding another.` },
        { status: 409 },
      );
    }

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
