import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { toErrorMessage } from "@/lib/api/errors";
import { opspUpsertSchema, opspFinalizeSchema } from "@/lib/schemas/opspSchema";

/* ── GET: load OPSP data for current user + year + quarter ── */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = req.nextUrl;
    const year    = parseInt(searchParams.get("year")    ?? String(new Date().getFullYear()));
    const quarter = searchParams.get("quarter") ?? "Q1";

    // Resolve tenantId + fiscalYearStart from membership
    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
      include: { tenant: { select: { fiscalYearStart: true } } },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const data = await db.oPSPData.findUnique({
      where: {
        tenantId_userId_year_quarter: {
          tenantId: membership.tenantId,
          userId:   session.user.id,
          year,
          quarter,
        },
      },
    });

    // Response includes both the standard envelope (success/data) AND the legacy
    // top-level `fiscalYearStart` field that the OPSP page currently reads.
    // Additive only — do not remove `fiscalYearStart` without updating page.tsx.
    return NextResponse.json({
      success: true,
      data: data ?? null,
      fiscalYearStart: membership.tenant?.fiscalYearStart ?? 1,
    });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to load OPSP") },
      { status: 500 }
    );
  }
}

/* ── PUT: upsert (autosave) ── */
export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsed = opspUpsertSchema.safeParse(await req.json());
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message ?? "Invalid OPSP payload";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    const { year, quarter, ...fields } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const data = await db.oPSPData.upsert({
      where: {
        tenantId_userId_year_quarter: {
          tenantId: membership.tenantId,
          userId:   session.user.id,
          year:     yearNum,
          quarter,
        },
      },
      update: {
        ...fields,
        updatedBy: session.user.id,
      },
      create: {
        tenantId:  membership.tenantId,
        userId:    session.user.id,
        year:      yearNum,
        quarter,
        createdBy: session.user.id,
        ...fields,
      },
    });

    // Envelope: { success, data, savedAt } — savedAt kept for back-compat.
    return NextResponse.json({ success: true, data, savedAt: new Date().toISOString() });
  } catch (error: unknown) {
    const message = toErrorMessage(error, "Failed to save OPSP");
    console.error("[PUT /api/opsp]", message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

/* ── POST: finalize ── */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const parsedFinalize = opspFinalizeSchema.safeParse(await req.json());
    if (!parsedFinalize.success) {
      const msg = parsedFinalize.error.errors[0]?.message ?? "Invalid OPSP payload";
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }
    const { year, quarter } = parsedFinalize.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    const membership = await db.membership.findFirst({
      where: { userId: session.user.id, status: "active" },
      orderBy: { createdAt: "asc" },
    });
    if (!membership) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    const result = await db.oPSPData.updateMany({
      where: {
        tenantId: membership.tenantId,
        userId:   session.user.id,
        year:     yearNum,
        quarter,
      },
      data: { status: "finalized", updatedBy: session.user.id },
    });

    return NextResponse.json({ success: true, data: { count: result.count } }, { status: 201 });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, error: toErrorMessage(error, "Failed to finalize OPSP") },
      { status: 500 }
    );
  }
}
