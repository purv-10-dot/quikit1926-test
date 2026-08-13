import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyExternalApiKey } from "@/lib/services/external-api-key";
import { rateLimitOrResponse } from "@/lib/rate-limit";

// PUBLIC (API-key gated, no login) — read-only Department list for another
// QuikIT app (e.g. quikscale) to consume. One key per org, self-service via
// Settings → Integrations → Department API.

const ok = <T,>(data: T) => NextResponse.json({ success: true, data }, { status: 200 });
const err = (message: string, status: number) => NextResponse.json({ success: false, error: message }, { status });

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-api-key");

  // Rate-limit by the key itself (not IP) — a leaked key is capped regardless
  // of which machine it's used from. Missing key still gets a bucket (keyed by
  // "missing") so a caller hammering with no key at all can't dodge the cap.
  const rl = await rateLimitOrResponse("external.departments", apiKey ?? "missing", 60, 60);
  if (rl) return rl;

  try {
    const orgId = await verifyExternalApiKey(apiKey, "departments");
    if (!orgId) return err("Invalid or missing API key", 401);

    const departments = await prisma.department.findMany({
      where: { orgId, deletedAt: null },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    });
    return ok(departments);
  } catch (error) {
    console.error("GET /departments/external error:", error);
    return err("Internal server error", 500);
  }
}
