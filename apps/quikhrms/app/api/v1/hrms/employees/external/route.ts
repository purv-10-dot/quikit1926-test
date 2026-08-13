import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyExternalApiKey } from "@/lib/services/external-api-key";
import { rateLimitOrResponse } from "@/lib/rate-limit";

// PUBLIC (API-key gated, no login) — read-only Employee directory for another
// QuikIT app (e.g. quikscale) to consume. Same key as the Department API
// (Settings → Integrations → Department API) — one per-org key covers both.
// Only non-sensitive directory fields are exposed here — no salary, bank,
// government-ID, or personal-address data.

const ok = <T,>(data: T) => NextResponse.json({ success: true, data }, { status: 200 });
const err = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status });

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");

  const rl = await rateLimitOrResponse("external.employees", apiKey ?? "missing", 60, 60);
  if (rl) return rl;

  try {
    const orgId = await verifyExternalApiKey(apiKey, "employees");
    if (!orgId) return err("Invalid or missing API key", 401);

    const employees = await prisma.employee.findMany({
      where: { orgId, deletedAt: null },
      select: {
        id: true,
        employeeCode: true,
        firstName: true,
        lastName: true,
        workEmail: true,
        jobTitle: true,
        status: true,
        reportingManagerId: true,
        department: { select: { id: true, name: true } },
        designation: { select: { id: true, title: true } },
      },
      orderBy: { firstName: "asc" },
    });
    return ok(employees);
  } catch (error) {
    console.error("GET /employees/external error:", error);
    return err("Internal server error", 500);
  }
}
