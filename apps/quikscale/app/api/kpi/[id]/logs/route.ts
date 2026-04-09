import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { authOptions } from "@/lib/auth";
import { ApiResponse } from "@/lib/services/kpiService";

// GET /api/kpi/[id]/logs - Get audit logs for a KPI
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
    }

    const membership = await db.membership.findFirst({ where: { userId: session.user.id, status: "active" }, orderBy: { createdAt: "asc" } });
    const tenantId = membership?.tenantId;
    if (!tenantId) {
      return NextResponse.json({ success: false, error: "No active membership" }, { status: 403 });
    }

    // Check KPI exists and belongs to tenant
    const kpi = await db.kPI.findUnique({
      where: { id: params.id },
      select: { tenantId: true },
    });

    if (!kpi) {
      return NextResponse.json(
        { success: false, error: "KPI not found" },
        { status: 404 }
      );
    }

    if (kpi.tenantId !== tenantId) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 403 }
      );
    }

    // Get audit logs
    const logs = await db.kPILog.findMany({
      where: { kpiId: params.id },
      select: { id: true, action: true, oldValue: true, newValue: true, changedBy: true, reason: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    });

    // Resolve user names for changedBy IDs
    const userIds = [...new Set(logs.map(l => l.changedBy))];
    const users = await db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, firstName: true, lastName: true } });
    const userMap = Object.fromEntries(users.map(u => [u.id, `${u.firstName} ${u.lastName}`]));

    const enrichedLogs = logs.map(l => ({ ...l, changedByName: userMap[l.changedBy] ?? l.changedBy }));

    const response: ApiResponse<any> = {
      success: true,
      data: enrichedLogs,
    };

    return NextResponse.json(response);
  } catch (error: any) {
    console.error(`GET /api/kpi/[id]/logs error:`, error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to fetch audit logs",
      },
      { status: 500 }
    );
  }
}
