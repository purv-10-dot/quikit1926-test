import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

/* ── GET: load OPSP data for current user + year + quarter ── */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const year    = parseInt(searchParams.get("year")    ?? String(new Date().getFullYear()));
  const quarter = searchParams.get("quarter") ?? "Q1";

  // Resolve tenantId from membership
  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.json({ error: "No active membership" }, { status: 403 });
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

  return NextResponse.json({ data: data ?? null });
}

/* ── PUT: upsert (autosave) ── */
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { year, quarter, ...fields } = body;

  if (!year || !quarter) {
    return NextResponse.json({ error: "year and quarter are required" }, { status: 400 });
  }

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.json({ error: "No active membership" }, { status: 403 });
  }

  try {
    const data = await db.oPSPData.upsert({
      where: {
        tenantId_userId_year_quarter: {
          tenantId: membership.tenantId,
          userId:   session.user.id,
          year:     parseInt(year),
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
        year:      parseInt(year),
        quarter,
        createdBy: session.user.id,
        ...fields,
      },
    });

    return NextResponse.json({ data, savedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[PUT /api/opsp]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/* ── POST: finalize ── */
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { year, quarter } = await req.json();

  const membership = await db.membership.findFirst({
    where: { userId: session.user.id, status: "active" },
    orderBy: { createdAt: "asc" },
  });
  if (!membership) {
    return NextResponse.json({ error: "No active membership" }, { status: 403 });
  }

  const data = await db.oPSPData.updateMany({
    where: {
      tenantId: membership.tenantId,
      userId:   session.user.id,
      year:     parseInt(year),
      quarter,
    },
    data: { status: "finalized", updatedBy: session.user.id },
  });

  return NextResponse.json({ success: true });
}
