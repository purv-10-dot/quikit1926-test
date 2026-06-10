/**
 * Server-side dashboard pins (CrmDashboardPin) — replaces the old
 * localStorage-only `qcrm.dashboard.pinnedTel.v1` key. The client migrates
 * its local key on first load by POSTing each id once and then clearing the
 * local key.
 */
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import type { DashboardPin } from "@/lib/dashboard/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_REPORT_IDS = new Set([
  "calls-by-disposition",
  "day-wise",
  "hourly",
  "metrics-by-user",
  "duration-by-user",
  "total-volume",
]);

const postSchema = z.object({
  reportId: z.string().min(1).max(64),
});

const patchSchema = z.object({
  order: z.array(z.string().min(1)),
});

const deleteSchema = z.object({
  reportId: z.string().min(1).max(64),
});

async function loadPins(orgId: string, userId: string): Promise<DashboardPin[]> {
  const rows = await prisma.crmDashboardPin.findMany({
    where: { orgId, userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, reportId: true, sortOrder: true },
  });
  return rows.map((r) => ({ id: r.id, reportId: r.reportId, sortOrder: r.sortOrder }));
}

export async function GET() {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");
    const items = await loadPins(user.orgId, user.userId);
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const body = await req.json().catch(() => null);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }
    if (!VALID_REPORT_IDS.has(parsed.data.reportId)) {
      return NextResponse.json({ error: "Unknown reportId" }, { status: 400 });
    }

    const max = await prisma.crmDashboardPin.aggregate({
      where: { orgId: user.orgId, userId: user.userId },
      _max: { sortOrder: true },
    });
    const nextOrder = (max._max.sortOrder ?? -1) + 1;

    await prisma.crmDashboardPin.upsert({
      where: {
        orgId_userId_reportId: {
          orgId: user.orgId,
          userId: user.userId,
          reportId: parsed.data.reportId,
        },
      },
      create: {
        orgId: user.orgId,
        userId: user.userId,
        reportId: parsed.data.reportId,
        sortOrder: nextOrder,
      },
      update: {},
    });

    const items = await loadPins(user.orgId, user.userId);
    return NextResponse.json({ items }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const body = await req.json().catch(() => null);
    const parsed = deleteSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await prisma.crmDashboardPin.deleteMany({
      where: { orgId: user.orgId, userId: user.userId, reportId: parsed.data.reportId },
    });

    const items = await loadPins(user.orgId, user.userId);
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "dashboard", "view");

    const body = await req.json().catch(() => null);
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid body" }, { status: 400 });
    }

    await prisma.$transaction(
      parsed.data.order.map((reportId, i) =>
        prisma.crmDashboardPin.updateMany({
          where: { orgId: user.orgId, userId: user.userId, reportId },
          data: { sortOrder: i },
        }),
      ),
    );

    const items = await loadPins(user.orgId, user.userId);
    return NextResponse.json({ items });
  } catch (e) {
    return errorResponse(e);
  }
}
