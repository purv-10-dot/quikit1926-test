import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/internal/resolve-employee — central User.id → HRMS Employee.id.
 *
 * The AI runtime carries the platform `User.id`, but the service-auth path
 * (`x-acting-employee-id`) needs the HRMS `Employee.id`. This endpoint bridges
 * the two via `Employee.authUserId` (the column that links an employee to their
 * central login), so the runtime can populate `x-acting-employee-id` before
 * calling any data route.
 *
 * Auth: service-to-service only — same dual-secret gate as /api/internal/manifest
 * (INTERNAL_AI_RUNTIME_SECRET or INTERNAL_SECRET via `x-internal-secret`).
 *
 * Request:  header `x-org-id`, query `?userId=<central User.id>`
 * Response: { success: true, data: { employeeId, employeeCode, status,
 *            firstName, lastName } } or 404 when no active employee is linked.
 */
export async function GET(req: NextRequest) {
  const runtimeSecret = process.env.INTERNAL_AI_RUNTIME_SECRET;
  const sharedSecret = process.env.INTERNAL_SECRET;
  const provided = req.headers.get("x-internal-secret");
  const ok =
    !!provided &&
    ((!!runtimeSecret && provided === runtimeSecret) || (!!sharedSecret && provided === sharedSecret));
  if (!ok) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const orgId = req.headers.get("x-org-id")?.trim();
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!orgId || !userId) {
    return NextResponse.json(
      { success: false, error: "x-org-id header and userId query param are required" },
      { status: 400 },
    );
  }

  try {
    const emp = await prisma.employee.findFirst({
      where: { orgId, authUserId: userId, deletedAt: null },
      select: { id: true, employeeCode: true, status: true, firstName: true, lastName: true },
    });
    if (!emp) {
      return NextResponse.json(
        { success: false, error: "No employee is linked to this user in this org" },
        { status: 404 },
      );
    }
    return NextResponse.json({
      success: true,
      data: {
        employeeId: emp.id,
        employeeCode: emp.employeeCode,
        status: emp.status,
        firstName: emp.firstName,
        lastName: emp.lastName,
      },
    });
  } catch (error) {
    console.error("GET /internal/resolve-employee error:", error);
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 });
  }
}
