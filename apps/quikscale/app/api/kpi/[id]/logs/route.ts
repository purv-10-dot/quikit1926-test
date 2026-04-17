import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withTenantAuthForModule } from "@/lib/api/withTenantAuth";
const withTenantAuth = withTenantAuthForModule("kpi");

// GET /api/kpi/[id]/logs - Get audit logs for a KPI
export const GET = withTenantAuth<{ id: string }>(
  async ({ tenantId }, _request, { params }) => {
    // Check KPI exists and belongs to tenant
    const kpi = await db.kPI.findUnique({
      where: { id: params.id },
      select: { tenantId: true },
    });

    if (!kpi) {
      return NextResponse.json(
        { success: false, error: "KPI not found" },
        { status: 404 },
      );
    }

    if (kpi.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 },
      );
    }

    const logs = await db.kPILog.findMany({
      where: { kpiId: params.id },
      select: {
        id: true,
        action: true,
        oldValue: true,
        newValue: true,
        changedBy: true,
        reason: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const userIds = [...new Set(logs.map((l) => l.changedBy))];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, firstName: true, lastName: true },
    });
    const userMap = Object.fromEntries(
      users.map((u) => [u.id, `${u.firstName} ${u.lastName}`]),
    );

    const enrichedLogs = logs.map((l) => ({
      ...l,
      changedByName: userMap[l.changedBy] ?? l.changedBy,
    }));

    return NextResponse.json({ success: true, data: enrichedLogs });
  },
  { fallbackErrorMessage: "Failed to fetch audit logs" },
);
