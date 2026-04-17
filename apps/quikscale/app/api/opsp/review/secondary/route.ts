import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/api/requireAdmin";
import { gateModuleApi } from "@quikit/auth/feature-gate";
import { writeAuditLog } from "@/lib/api/auditLog";
import { validationError } from "@/lib/api/validationError";
import { opspReviewSecondarySaveSchema } from "@/lib/schemas/opspReviewSchema";

/**
 * POST /api/opsp/review/secondary
 *
 * Saves status + comment for a secondary review row
 * (rocks / key initiatives / key thrusts).
 * Uses OPSPReviewEntry with period="secondary".
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth && auth.error) return auth.error;
    const { tenantId, userId } = auth;
    const blocked = await gateModuleApi("quikscale", "opsp.review", tenantId);
    if (blocked) return blocked;

    const parsed = opspReviewSecondarySaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed, "Invalid secondary review data");

    const { year, quarter, horizon, rowIndex, category, status, comment } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    // 1. Verify OPSP exists
    const opsp = await db.oPSPData.findUnique({
      where: {
        tenantId_userId_year_quarter: { tenantId, userId, year: yearNum, quarter },
      },
      select: { id: true },
    });

    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // 2. Upsert the secondary entry (period="secondary", status stored in comment as JSON prefix)
    const savedEntry = await db.oPSPReviewEntry.upsert({
      where: {
        tenantId_opspId_horizon_rowIndex_period: {
          tenantId,
          opspId: opsp.id,
          horizon,
          rowIndex,
          period: "secondary",
        },
      },
      update: {
        category,
        comment: JSON.stringify({ status: status ?? null, text: comment ?? "" }),
        updatedBy: userId,
      },
      create: {
        tenantId,
        opspId: opsp.id,
        userId,
        horizon,
        rowIndex,
        category,
        period: "secondary",
        comment: JSON.stringify({ status: status ?? null, text: comment ?? "" }),
        updatedBy: userId,
      },
    });

    // 3. Audit log
    await writeAuditLog({
      tenantId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Review",
      entityId: opsp.id,
      changes: [`${horizon}:secondary:${category}:row${rowIndex}`],
      reason: `OPSP Review: ${horizon} secondary row ${rowIndex}`,
    });

    return NextResponse.json({
      success: true,
      data: {
        rowIndex,
        status: status ?? null,
        comment: comment ?? "",
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Failed to save secondary review data";
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
