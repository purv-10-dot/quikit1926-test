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
    const { orgId, userId } = auth;
    const blocked = await gateModuleApi("quikscale", "opsp.review", orgId);
    if (blocked) return blocked;

    const parsed = opspReviewSecondarySaveSchema.safeParse(await req.json());
    if (!parsed.success) return validationError(parsed, "Invalid secondary review data");

    const { year, quarter, horizon, rowIndex, category, status, comment } = parsed.data;
    const yearNum = typeof year === "number" ? year : parseInt(year);

    // 1. Verify OPSP exists
    const opsp = await db.oPSPData.findUnique({
      where: {
        orgId_userId_year_quarter: { orgId, userId, year: yearNum, quarter },
      },
      select: { id: true },
    });

    if (!opsp) {
      return NextResponse.json(
        { success: false, error: "No OPSP found for this period" },
        { status: 404 },
      );
    }

    // 2a. Snapshot pre-update state. comment field stores JSON {status, text}.
    const prev = await db.oPSPReviewEntry.findUnique({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
          opspId: opsp.id,
          horizon,
          rowIndex,
          period: "secondary",
        },
      },
      select: { comment: true, category: true },
    });
    let prevStatus: string | null = null;
    let prevText = "";
    if (prev?.comment) {
      try {
        const parsed = JSON.parse(prev.comment) as { status?: string | null; text?: string };
        prevStatus = parsed.status ?? null;
        prevText = parsed.text ?? "";
      } catch {
        // Pre-JSON entries — surface raw string as the text.
        prevText = prev.comment;
      }
    }
    const oldSnapshot = {
      horizon,
      rowIndex,
      category: prev?.category ?? null,
      status: prevStatus,
      comment: prevText,
    };
    const newSnapshot = {
      horizon,
      rowIndex,
      category,
      status: status ?? null,
      comment: comment ?? "",
    };

    // 2b. Upsert the secondary entry (period="secondary", status stored in comment as JSON prefix)
    const savedEntry = await db.oPSPReviewEntry.upsert({
      where: {
        orgId_opspId_horizon_rowIndex_period: {
          orgId,
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
        orgId,
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
      orgId,
      actorId: userId,
      action: "UPDATE",
      entityType: "Review",
      entityId: opsp.id,
      oldValues: oldSnapshot,
      newValues: newSnapshot,
      changes: [`${horizon}:secondary:${category}:row${rowIndex}`],
      reason: `OPSP Secondary (${horizon}|rowIndex=${rowIndex}): ${category}`,
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
